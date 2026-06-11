import * as pbi from 'powerbi-client';

const powerbiService = new pbi.service.Service(
  pbi.factories.hpmFactory,
  pbi.factories.wpmpFactory,
  pbi.factories.routerFactory
);

export function usePowerBIService(): pbi.service.Service {
  return powerbiService;
}

export default usePowerBIService;
