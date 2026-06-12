import type { LedgerRow } from '../core/ledger-logic';
import type { SeriesPoint } from '../core/dax';

export interface MockLedgerDataset {
  tileId: string;
  groupLevels: string[];
  rows: LedgerRow[];
  measureLabel: string;
}

export interface MockBarDataset {
  tileId: string;
  points: SeriesPoint[];
  measureLabel: string;
}

export const DENIALS_BAR_DATA: MockBarDataset = {
  tileId: 'v0',
  measureLabel: 'Denials',
  points: [
    { label: 'Wk 01', value: 142 },
    { label: 'Wk 02', value: 189 },
    { label: 'Wk 03', value: 213 },
    { label: 'Wk 04', value: 176 },
    { label: 'Wk 05', value: 228 },
    { label: 'Wk 06', value: 195 },
    { label: 'Wk 07', value: 241 },
    { label: 'Wk 08', value: 183 },
    { label: 'Wk 09', value: 267 },
    { label: 'Wk 10', value: 254 },
    { label: 'Wk 11', value: 308 },
    { label: 'Wk 12', value: 289 },
  ],
};

export const PAYOR_CATEGORY_LEDGER: MockLedgerDataset = {
  tileId: 'v1',
  groupLevels: ['PAYOR CATEGORY', 'PAYOR'],
  measureLabel: 'Denials',
  rows: [
    { groups: ['MEDICARE', 'Medicare A'], value: 312 },
    { groups: ['MEDICARE', 'Medicare B'], value: 198 },
    { groups: ['MEDICARE', 'Medicare Advantage'], value: 87 },
    { groups: ['MEDICAID', 'State Medicaid'], value: 256 },
    { groups: ['MEDICAID', 'Managed Medicaid'], value: 143 },
    { groups: ['COMMERCIAL', 'Blue Cross'], value: 174 },
    { groups: ['COMMERCIAL', 'Aetna'], value: 112 },
    { groups: ['COMMERCIAL', 'UHC'], value: 98 },
    { groups: ['COMMERCIAL', 'Cigna'], value: 67 },
    { groups: ['OTHER', 'Self Pay'], value: 44 },
    { groups: ['OTHER', 'Workers Comp'], value: 31 },
  ],
};

export const DENIAL_CODE_LEDGER: MockLedgerDataset = {
  tileId: 'v2',
  groupLevels: ['MINOR CATEGORY', 'DESCRIPTION', 'CODE'],
  measureLabel: 'Count',
  rows: [
    { groups: ['AUTHORIZATION', 'Prior Auth Required', 'CO-4'], value: 287 },
    { groups: ['AUTHORIZATION', 'Auth Not on File', 'CO-15'], value: 134 },
    { groups: ['AUTHORIZATION', 'Auth Expired', 'CO-97'], value: 89 },
    { groups: ['ELIGIBILITY', 'Not Eligible on Date', 'CO-27'], value: 213 },
    { groups: ['ELIGIBILITY', 'Coverage Terminated', 'CO-31'], value: 156 },
    { groups: ['ELIGIBILITY', 'Plan Limitation', 'CO-96'], value: 78 },
    { groups: ['MEDICAL NECESSITY', 'Not Medically Necessary', 'CO-50'], value: 321 },
    { groups: ['MEDICAL NECESSITY', 'Missing Documentation', 'CO-167'], value: 198 },
    { groups: ['BILLING', 'Duplicate Claim', 'CO-18'], value: 112 },
    { groups: ['BILLING', 'Modifier Missing', 'CO-4'], value: 67 },
  ],
};

export const DRIVER_LEDGER: MockLedgerDataset = {
  tileId: 'v3',
  groupLevels: ['DRIVER', 'PAYOR'],
  measureLabel: 'Count',
  rows: [
    { groups: ['Anderson, J', 'Medicare A'], value: 24 },
    { groups: ['Anderson, J', 'Medicare B'], value: 18 },
    { groups: ['Brown, K', 'State Medicaid'], value: 31 },
    { groups: ['Brown, K', 'Managed Medicaid'], value: 22 },
    { groups: ['Clark, M', 'Blue Cross'], value: 19 },
    { groups: ['Clark, M', 'Aetna'], value: 14 },
    { groups: ['Davis, P', 'Medicare A'], value: 28 },
    { groups: ['Evans, R', 'UHC'], value: 17 },
    { groups: ['Evans, R', 'Cigna'], value: 11 },
    { groups: ['Fisher, S', 'Medicare Advantage'], value: 23 },
    { groups: ['Garcia, T', 'State Medicaid'], value: 35 },
  ],
};

export const ALL_LEDGERS: MockLedgerDataset[] = [
  PAYOR_CATEGORY_LEDGER,
  DENIAL_CODE_LEDGER,
  DRIVER_LEDGER,
];
