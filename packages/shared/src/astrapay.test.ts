// Unit tests for the framework-free AstraPay SNAP helpers + mock.
// Zero-dep: runs on Node's built-in test runner with native TS type-stripping.
//   node --test packages/shared/src/astrapay.test.ts      (or: pnpm test)
// The live integration (signing + endpoints) is covered by scripts/astrapay-smoke.mjs.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isAstraPayLive, normalizeTxnStatus } from './astrapay-client.ts';
import { payAstraPay } from './mocks/astrapay.ts';

// normalizeTxnStatus is the gate the status-poll uses to decide SUCCESS vs keep
// polling — wrong either hangs a paid booking or marks an unpaid one done.
describe('normalizeTxnStatus', () => {
  it('success codes → SUCCESS', () => {
    assert.equal(normalizeTxnStatus({ latestTransactionStatus: '00' }), 'SUCCESS');
    assert.equal(normalizeTxnStatus({ latestTransactionStatus: 'APP' }), 'SUCCESS');
    assert.equal(normalizeTxnStatus({ transactionStatus: 'SUCCESS' }), 'SUCCESS');
  });

  it('in-flight codes → PENDING (keep polling)', () => {
    for (const c of ['01', '02', '03', '04', 'PND', '']) {
      assert.equal(normalizeTxnStatus({ latestTransactionStatus: c }), 'PENDING');
    }
  });

  it('rejected / unknown → REJECTED / FAILED', () => {
    assert.equal(normalizeTxnStatus({ latestTransactionStatus: 'REJ' }), 'REJECTED');
    assert.equal(normalizeTxnStatus({ latestTransactionStatus: 'REJECTED' }), 'REJECTED');
    assert.equal(normalizeTxnStatus({ latestTransactionStatus: '99' }), 'FAILED');
  });

  it('prefers latestTransactionStatus over transactionStatus', () => {
    assert.equal(
      normalizeTxnStatus({ latestTransactionStatus: '00', transactionStatus: '99' }),
      'SUCCESS',
    );
  });

  it('empty response → PENDING (not yet visible)', () => {
    assert.equal(normalizeTxnStatus({}), 'PENDING');
  });

  it('is case-insensitive', () => {
    assert.equal(normalizeTxnStatus({ latestTransactionStatus: 'app' }), 'SUCCESS');
    assert.equal(normalizeTxnStatus({ latestTransactionStatus: 'rej' }), 'REJECTED');
  });
});

describe('isAstraPayLive', () => {
  it('true only for "1" / "true"', () => {
    assert.equal(isAstraPayLive('1'), true);
    assert.equal(isAstraPayLive('true'), true);
  });

  it('false for everything else', () => {
    for (const v of ['0', '', 'yes', undefined, null]) {
      assert.equal(isAstraPayLive(v), false);
    }
  });
});

describe('payAstraPay (mock)', () => {
  it('resolves a success receipt, ref===txId, and fires staged callbacks', async () => {
    const stages: string[] = [];
    const r = await payAstraPay(83000, 'Servis Vario', { onStage: (s) => stages.push(s) });
    assert.equal(r.success, true);
    assert.equal(r.amount, 83000);
    assert.equal(r.description, 'Servis Vario');
    assert.equal(r.method, 'astrapay');
    assert.equal(typeof r.txId, 'string');
    assert.equal(r.ref, r.txId); // call sites store astrapay_ref = ref ?? txId
    assert.deepEqual(stages, ['connecting', 'processing', 'success']);
  });
});
