const dayMs = 86_400_000;
const shanghaiOffsetMs = 8 * 60 * 60 * 1_000;

function timestamp(value: string | Date, label: string) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} is invalid`);
  return date.getTime();
}

function shanghaiDayStart(value: number) {
  return Math.floor((value + shanghaiOffsetMs) / dayMs) * dayMs - shanghaiOffsetMs;
}

export function normalizeShanghaiReportingPeriod(input: {
  periodStart: string;
  periodEnd: string;
}) {
  const requestedStart = timestamp(input.periodStart, "Reporting period start");
  const requestedEnd = timestamp(input.periodEnd, "Reporting period end");
  if (requestedStart >= requestedEnd) throw new Error("Reporting period start must precede its end");

  const periodStart = shanghaiDayStart(requestedStart);
  const endFloor = shanghaiDayStart(requestedEnd);
  const periodEnd = requestedEnd === endFloor ? endFloor : endFloor + dayMs;
  if ((periodEnd - periodStart) / dayMs > 93) {
    throw new Error("Reporting period cannot exceed 93 Shanghai calendar days");
  }
  return {
    periodStart: new Date(periodStart).toISOString(),
    periodEnd: new Date(periodEnd).toISOString(),
  };
}

export function shanghaiReportingWindow(
  days: number,
  now: Date = new Date(),
  reportingLagDays = 3,
) {
  if (!Number.isInteger(days) || days < 1 || days > 93) {
    throw new Error("Reporting window must contain 1 to 93 Shanghai calendar days");
  }
  if (!Number.isInteger(reportingLagDays) || reportingLagDays < 0 || reportingLagDays > 14) {
    throw new Error("Reporting lag must contain 0 to 14 complete Shanghai days");
  }
  const current = timestamp(now, "Reporting window reference time");
  const periodEnd = shanghaiDayStart(current) - reportingLagDays * dayMs;
  return {
    periodStart: new Date(periodEnd - days * dayMs).toISOString(),
    periodEnd: new Date(periodEnd).toISOString(),
  };
}
