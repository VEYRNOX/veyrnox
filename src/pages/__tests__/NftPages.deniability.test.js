import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const nftPortfolioSrc = readFileSync(resolve(here, '../NFTPortfolio.jsx'), 'utf8');
const multiChainSrc = readFileSync(resolve(here, '../MultiChainNFT.jsx'), 'utf8');
const suspiciousSrc = readFileSync(resolve(here, '../SuspiciousAssets.jsx'), 'utf8');

describe('NFT pages — deniability gates', () => {
  it('NFTPortfolio gates the query on the live deniability helper and blanks cached rows', () => {
    expect(nftPortfolioSrc).toMatch(/isDeniabilityOrDemoActive/);
    expect(nftPortfolioSrc).toMatch(/enabled:\s*nftQueryEnabled/);
    expect(nftPortfolioSrc).toMatch(/const nfts = nftQueryEnabled \? nftsRaw : \[\]/);
  });

  it('MultiChainNFT gates the query on the live deniability helper and blanks cached rows', () => {
    expect(multiChainSrc).toMatch(/isDeniabilityOrDemoActive/);
    expect(multiChainSrc).toMatch(/enabled:\s*nftQueryEnabled/);
    expect(multiChainSrc).toMatch(/const nfts = nftQueryEnabled \? nftsRaw : \[\]/);
  });

  it('SuspiciousAssets gates both local entity queries and remote intel fetches', () => {
    expect(suspiciousSrc).toMatch(/isDeniabilityOrDemoActive/);
    expect(suspiciousSrc).toMatch(/enabled:\s*localReviewEnabled/);
    expect(suspiciousSrc).toMatch(/const tokenRows = localReviewEnabled \? tokenRowsRaw : \[\]/);
    expect(suspiciousSrc).toMatch(/const nftRows = localReviewEnabled \? nftRowsRaw : \[\]/);
    expect(suspiciousSrc).toMatch(/if \(!localReviewEnabled \|\| !token\?\.id/);
  });
});
