export type MonthlyRecord = {
  period: string;
  label: string;
  total: number;
  yoy: number | null;
  floorArea: number | null;
  ownerOccupied: number;
  rental: number;
  salaryHousing: number;
  forSale: number;
  condominium: number;
  detached: number;
};

export type PrefectureRecord = {
  code: string;
  name: string;
  total: number;
  yoy: number | null;
  ownerOccupied: number;
  rental: number;
  salaryHousing: number;
  forSale: number;
  condominium: number;
  detached: number;
};

export type StatisticsMetadata = {
  title: string;
  organization: string;
  surveyPeriod: string;
  fetchedAt: string;
  sourcePage: string;
  sourceList: string;
  usageStatInfId: string;
  prefectureStatInfId: string;
  mode: "live" | "snapshot";
  note?: string;
};

export type StatisticsPayload = {
  monthly: MonthlyRecord[];
  prefectures: PrefectureRecord[];
  metadata: StatisticsMetadata;
};
