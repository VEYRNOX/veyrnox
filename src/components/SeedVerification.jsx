// src/components/SeedVerification.jsx — Resumable word-position quiz with deferral.
// Receives the full mnemonic only to generate quiz questions locally — the
// mnemonic is never logged, never included in analytics metadata, and never
// persisted by this component (only checkpoint/verified/deferred flags are).
import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle } from 'lucide-react';
import { emit, FunnelEvent } from '@/lib/analytics';
import {
  saveCheckpoint, loadCheckpoint, clearCheckpoint,
  markVerified, markDeferred,
} from '@/lib/seedVerifyState';

const QUESTIONS = 3;

function pickPositions(total, count) {
  const positions = [];
  const used = new Set();
  while (positions.length < count) {
    const p = Math.floor(Math.random() * total);
    if (!used.has(p)) { used.add(p); positions.push(p); }
  }
  return positions.sort((a, b) => a - b);
}

function generateOptions(correctWord, allWords) {
  const opts = new Set([correctWord]);
  while (opts.size < 4) {
    opts.add(allWords[Math.floor(Math.random() * allWords.length)]);
  }
  return [...opts].sort(() => Math.random() - 0.5);
}

export default function SeedVerification({ seedWords, walletId, onVerified, onDeferred }) {
  const positions = useMemo(() => pickPositions(seedWords.length, QUESTIONS), [seedWords.length]);
  const checkpoint = loadCheckpoint(walletId);
  const [qi, setQi] = useState(checkpoint?.questionIndex ?? 0);
  const [correct, setCorrect] = useState(checkpoint?.correctCount ?? 0);
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    Promise.resolve(emit(FunnelEvent.SEED_VERIFY_STARTED, { resumed: !!checkpoint })).catch(() => {});
  }, []);

  const pos = positions[qi];
  const correctWord = seedWords[pos];
  const options = useMemo(() => generateOptions(correctWord, seedWords), [qi, correctWord]);

  const handleAnswer = (word) => {
    setSelected(word);
    const isCorrect = word === correctWord;
    setFeedback(isCorrect ? 'correct' : 'wrong');
    const newCorrect = isCorrect ? correct + 1 : correct;

    Promise.resolve(emit(FunnelEvent.SEED_VERIFY_ATTEMPT, {
      attempt_index: qi + 1,
      is_correct: isCorrect,
    })).catch(() => {});

    setTimeout(() => {
      const nextQi = qi + 1;
      if (nextQi >= QUESTIONS) {
        clearCheckpoint(walletId);
        if (newCorrect === QUESTIONS) {
          markVerified(walletId);
          Promise.resolve(emit(FunnelEvent.SEED_VERIFY_PASSED)).catch(() => {});
          onVerified();
        } else {
          Promise.resolve(emit(FunnelEvent.SEED_VERIFY_FAILED, { correct: newCorrect, total: QUESTIONS })).catch(() => {});
          setQi(0);
          setCorrect(0);
          setSelected(null);
          setFeedback(null);
        }
      } else {
        saveCheckpoint(walletId, nextQi, newCorrect);
        setQi(nextQi);
        setCorrect(newCorrect);
        setSelected(null);
        setFeedback(null);
      }
    }, 800);
  };

  const handleDefer = () => {
    markDeferred(walletId);
    saveCheckpoint(walletId, qi, correct);
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
      <p className="text-center text-sm">
        What is <span className="font-bold">word #{pos + 1}</span> in your recovery phrase?
      </p>
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
              disabled={!!feedback}
              onClick={() => handleAnswer(word)}
              className="justify-start gap-2"
            >
              {isThis && feedback === 'correct' && <CheckCircle2 className="h-4 w-4" />}
              {isThis && feedback === 'wrong' && <XCircle className="h-4 w-4" />}
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
