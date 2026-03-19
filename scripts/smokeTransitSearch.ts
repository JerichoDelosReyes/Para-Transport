import { getRouteGraphStats, searchTransitRoutes } from '../services/transitSearch';

type Scenario = {
  name: string;
  originQuery: string;
  destinationQuery: string;
  expectOptions: boolean;
};

const SCENARIOS: Scenario[] = [
  {
    name: 'single-route direct path',
    originQuery: 'BDO',
    destinationQuery: 'District',
    expectOptions: true,
  },
  {
    name: 'multi-route transfer path',
    originQuery: 'Dbb1',
    destinationQuery: 'Dbbc',
    expectOptions: true,
  },
  {
    name: 'known no-route pair',
    originQuery: 'Baclaran',
    destinationQuery: 'SM Molino',
    expectOptions: false,
  },
];

function printOptionPreview(
  scenario: Scenario,
  optionsCount: number,
  top?: { title: string; fare: number; eta: number; transfers: number; walk: number }
): void {
  if (!top) {
    console.log(`- [${scenario.name}] ${scenario.originQuery} -> ${scenario.destinationQuery}: no options`);
    return;
  }

  console.log(
    `- [${scenario.name}] ${scenario.originQuery} -> ${scenario.destinationQuery}: ${optionsCount} option(s), top=${top.title}, fare=P${top.fare.toFixed(
      2
    )}, eta=${top.eta}m, transfers=${top.transfers}, walk=${top.walk}m`
  );
}

async function run(): Promise<void> {
  const stats = getRouteGraphStats();

  console.log('Transit graph stats');
  console.log(`- nodes: ${stats.nodeCount}`);
  console.log(`- edges: ${stats.edgeCount}`);
  console.log(`- intersections: ${stats.intersectionCount}`);

  let passing = 0;

  for (const scenario of SCENARIOS) {
    const result = await searchTransitRoutes({
      originQuery: scenario.originQuery,
      destinationQuery: scenario.destinationQuery,
      currentLocation: null,
    });

    const top = result.options[0];
    printOptionPreview(scenario, result.options.length, top ? {
      title: top.title,
      fare: top.totalFare,
      eta: top.estimatedMinutes,
      transfers: top.transferCount,
      walk: top.walkingMeters,
    } : undefined);

    const hasOptions = result.options.length > 0;

    if ((scenario.expectOptions && hasOptions) || (!scenario.expectOptions && !hasOptions)) {
      passing += 1;
    }
  }

  if (passing !== SCENARIOS.length) {
    throw new Error(`Smoke test failed: ${passing}/${SCENARIOS.length} scenarios matched expectations.`);
  }

  console.log('Transit smoke test passed.');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
