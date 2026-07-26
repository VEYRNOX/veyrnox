// src/components/SeedVerification.jsx — Resumable word-position quiz with deferral.
//
// NOT WIRED YET. No route imports this; SeedVerificationPage renders a
// placeholder because building the quiz needs the reauth-gated mnemonic
// reveal. The defects below were fixed here so that whoever wires it does not
// inherit them — but nothing in this file runs for a user today.
//
// The mnemonic is never logged, never included in analytics metadata, and
// never persisted by this component (only checkpoint/verified/deferred flags
// are) — AND, as of this revision, never rendered beyond the single word being
// asked about. Distractors come from the full BIP-39 wordlist, never from the
// user's own phrase: drawing them from `seedWords` put up to 4 real mnemonic
// words on screen per question (up to 12 of a 12-word phrase across the quiz),
// which both leaked the phrase to anyone watching and made the quiz solvable
// by elimination.
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { wordlist } from '@scure/bip39/wordlists/english';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle } from 'lucide-react';
import { emit, FunnelEvent } from '@/lib/analytics';
import {
  saveCheckpoint, loadCheckpoint, clearCheckpoint,
  markVerified, markDeferred,
} from '@/lib/seedVerifyState';

const QUESTIONS = 3;
const OPTIONS_PER_QUESTION = 4;
const FEEDBACK_MS = 800;

// Uniform random int in [0, max) from the CSPRNG. Math.random() is not used
// anywhere in this file: which positions get challenged is a security-relevant
// choice, and a predictable quiz is a weaker check.
function randomInt(max) {
  if (max <= 0) return 0;
  const limit = Math.floor(0xffffffff / max) * max;
  const buf = new Uint32Array(1);
  let v;
  do { crypto.getRandomValues(buf); v = buf[0]; } while (v >= limit);
  return v % max;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickPositions(total, count) {
  const n = Math.min(count, total);
  const used = new Set();
  while (used.size < n) used.add(randomInt(total));
  return [...used].sort((a, b) => a - b);
}

// Distractors are drawn from the BIP-39 wordlist EXCLUDING every word in the
// user's phrase, so no option other than the correct answer is ever a real
// word from their mnemonic.
function generateOptions(correctWord, seedWords) {
  const excluded = new Set(seedWords);
  const opts = new Set([correctWord]);
  let guard = 0;
  while (opts.size < OPTIONS_PER_QUESTION && guard++ < 1000) {
    const candidate = wordlist[randomInt(wordlist.length)];
    if (!excluded.has(candidate)) opts.add(candidate);
  }
  return shuffle([...opts]);
}

// A resumed checkpoint's positions are only trusted if they still describe a
// usable quiz for THIS phrase — right length, whole numbers, all in range, no
// duplicates. Anything else (tampered storage, a phrase of different length)
// falls back to a fresh draw rather than rendering an out-of-bounds question.
function validPositions(positions, total) {
  return Array.isArray(positions)
    && positions.length === Math.min(QUESTIONS, total)
    && positions.every((p) => Number.isInteger(p) && p >= 0 && p < total)
    && new Set(positions).size === positions.length;
}

export default function SeedVerification({ seedWords, walletId, onVerified, onDeferred }) {
  const checkpointRef = useRef(loadCheckpoint(walletId));
  const checkpoint = checkpointRef.current;
  // Reuse the checkpoint's positions so a resumed quiz asks the same questions.
  const positions = useMemo(
    () => (validPositions(checkpoint?.positions, seedWords.length)
      ? checkpoint.positions
      : pickPositions(seedWords.length, QUESTIONS)),
    [checkpoint, seedWords.length],
  );
  const [qi, setQi] = useState(checkpoint?.questionIndex ?? 0);
  const [correct, setCorrect] = useState(checkpoint?.correctCount ?? 0);
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [notice, setNotice] = useState('');
  const timerRef = useRef(null);
  const promptRef = useRef(null);

  useEffect(() => {
    Promise.resolve(emit(FunnelEvent.SEED_VERIFY_STARTED, { resumed: !!checkpoint })).catch(() => {});
  }, []);

  // Cancel any pending auto-advance on unmount so a queued callback cannot
  // run against a torn-down component.
  useEffect(() => () => clearTimeout(timerRef.current), []);

  // Move focus to the prompt whenever the question changes, so keyboard and
  // screen-reader users are not dropped on <body> after the option buttons
  // they were focused on are replaced.
  useEffect(() => { promptRef.current?.focus(); }, [qi]);

  const pos = positions[qi];
  const correctWord = seedWords[pos];
  // Keyed on qi as well as correctWord so a repeated word in the phrase still
  // gets a fresh option set per question.
  const options = useMemo(
    () => generateOptions(correctWord, seedWords),
    [qi, correctWord, seedWords],
  );

  const handleAnswer = useCallback((word) => {
    if (feedback) return; // ignore input during the feedback window
    setSelected(word);
    const isCorrect = word === correctWord;
    setFeedback(isCorrect ? 'correct' : 'wrong');
    setNotice(isCorrect ? 'Correct' : 'Not correct');
    const newCorrect = isCorrect ? correct + 1 : correct;

    Promise.resolve(emit(FunnelEvent.SEED_VERIFY_ATTEMPT, {
      attempt_index: qi + 1,
      is_correct: isCorrect,
    })).catch(() => {});

    timerRef.current = setTimeout(() => {
      const nextQi = qi + 1;
      if (nextQi >= QUESTIONS) {
        clearCheckpoint(walletId);
        if (newCorrect === QUESTIONS) {
          markVerified(walletId);
          Promise.resolve(emit(FunnelEvent.SEED_VERIFY_PASSED)).catch(() => {});
          onVerified();
        } else {
          Promise.resolve(emit(FunnelEvent.SEED_VERIFY_FAILED, { correct: newCorrect, total: QUESTIONS })).catch(() => {});
          // Say what happened. Previously the quiz silently jumped back to
          // question 1 with no explanation to any user.
          setNotice("That wasn't right — starting the check again.");
          setQi(0);
          setCorrect(0);
          setSelected(null);
          setFeedback(null);
        }
      } else {
        saveCheckpoint(walletId, nextQi, newCorrect, positions);
        setQi(nextQi);
        setCorrect(newCorrect);
        setSelected(null);
        setFeedback(null);
        setNotice('');
      }
    }, FEEDBACK_MS);
  }, [feedback, correctWord, correct, qi, walletId, positions, onVerified]);

  const handleDefer = () => {
    clearTimeout(timerRef.current);
    markDeferred(walletId);
    // Persist positions too, so skipping at question 1 — before any answer has
    // been saved — still pins the quiz rather than rerolling it on return.
    saveCheckpoint(walletId, qi, correct, positions);
    Promise.resolve(emit(FunnelEvent.SEED_VERIFY_DEFERRED, { at_question: qi + 1 })).catch(() => {});
    onDeferred();
  };

  return (
    <div className="max-w-sm mx-auto space-y-6 p-6">
      <div className="text-center space-y-1">
        <h2 className="text-lg font-semibold">Verify your backup</h2>
        <p className="text-sm text-muted-foreground">
          Question {qi + 1} of {QUESTIONS}
        </p>
      </div>
      <p
        ref={promptRef}
        tabIndex={-1}
        className="text-center text-sm outline-none"
      >
        What is <span className="font-bold">word #{pos + 1}</span> in your recovery phrase?
      </p>

      {/* Answer feedback and quiz-restart notices are visual-only otherwise —
          the icons below are decorative and announce nothing. */}
      <p role="status" aria-live="polite" className="sr-only">{notice}</p>

      <div className="grid grid-cols-2 gap-2">
        {options.map((word) => {
          const isThis = selected === word;
          const variant = !feedback ? 'outline'
            : isThis && feedback === 'correct' ? 'default'
            : isThis && feedback === 'wrong' ? 'destructive'
            : 'outline';
          return (
            <Button
              key={word}
              variant={variant}
              // aria-disabled rather than disabled: `disabled` yanks the
              // focused button out of the tab order mid-interaction and drops
              // focus to <body>. handleAnswer ignores input while feedback is
              // showing, so behaviour is unchanged.
              aria-disabled={!!feedback}
              onClick={() => handleAnswer(word)}
              className="justify-start gap-2 mono-value"
            >
              {isThis && feedback === 'correct' && <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
              {isThis && feedback === 'wrong' && <XCircle className="h-4 w-4" aria-hidden="true" />}
              {word}
            </Button>
          );
        })}
      </div>
      <Button variant="ghost" className="w-full text-muted-foreground" onClick={handleDefer}>
        Skip for now
      </Button>
      <p className="text-xs text-center text-muted-foreground">
        You can verify later, but sending above the safety threshold will require verification first.
      </p>
    </div>
  );
}
