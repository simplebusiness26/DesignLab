import { readFileSync, writeFileSync } from 'node:fs';

const path = 'scripts/acceptance.mjs';
const source = readFileSync(path, 'utf8');
const startMarker = "    const status = await runJson([...base, 'status']);";
const endMarker = "  }\n\n  // -----------------------------------------------------------------------\n  // Generic V1: prove the existing engine still works after the new runtime.";
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0) throw new Error('Expected Tournament B acceptance block was not found.');

const replacement = `    const status = await runJson([...base, 'status']);
    check('Tournament B status command succeeds', status.code === 0 && status.data !== null);
    const challengers = status.data?.challengers ?? [];
    const next = challengers.filter((item) => item.status === 'next');
    const katieLocked = challengers.find((item) => item.slug === 'katie-dill')?.status === 'locked';
    if (katieLocked) {
      check('Katie remains locked once her validated result exists', challengers.find((item) => item.slug === 'katie-dill')?.status === 'locked');
      check('Alex is the only next challenger after Katie locks', next.length === 1 && next[0]?.slug === 'alex-schleifer');
      check('challengers after Alex remain blocked', challengers.slice(2).every((item) => item.status === 'blocked'));
    } else {
      check('Katie is the only next challenger before any result is locked', next.length === 1 && next[0]?.slug === 'katie-dill');
      check('later challengers are blocked', challengers.slice(1).every((item) => item.status === 'blocked'));
    }

    const katie = await runJson([...base, 'prepare', 'katie-dill']);
    check('Katie packet prepares without a model backend', katie.code === 0 && katie.data !== null);
    check('Katie is challenger 1', katie.data?.order === 1);
    check('Katie packet is frozen to the same Xplorer SHA', katie.data?.sourceCommit === FROZEN_XPLORER);
    check('Katie packet loads only her persona path', katie.data?.personaPath?.endsWith('/katie-dill/PERSONA_PACK.md'));
    check('packet requires whole-app prototype', katie.data?.requiredOutputs?.includes('prototype/index.html'));
    check('packet requires Product Truth and Perfect-10 proof',
      katie.data?.requiredOutputs?.includes('PRODUCT_TRUTH_CHECK.json') &&
      katie.data?.requiredOutputs?.includes('PERFECT_10.json'));

    const alexProgress = await run([...base, 'prepare', 'alex-schleifer', '--json']);
    if (katieLocked) {
      check('Alex can start after Katie is locked', alexProgress.code === 0);
    } else {
      check('Alex cannot start before Katie is locked', alexProgress.code !== 0 && alexProgress.stderr.includes('must be fully locked'));
    }
`;

writeFileSync(path, source.slice(0, start) + replacement + source.slice(end), 'utf8');
console.log('Tournament B acceptance progression block updated.');
