"use client";

import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "commute-calculator-v1";
const WEEKLY_TARGET_MINUTES = 40 * 60;
const DEFAULT_ROWS = [
  { day: "월요일", shortDay: "월", start: "", end: "" },
  { day: "화요일", shortDay: "화", start: "", end: "" },
  { day: "수요일", shortDay: "수", start: "", end: "" },
  { day: "목요일", shortDay: "목", start: "", end: "" },
  { day: "금요일", shortDay: "금", start: "", end: "" },
] as const;

type WorkRow = {
  day: string;
  shortDay: string;
  start: string;
  end: string;
};

type Calculation = {
  confirmedMinutes: number;
  remainingMinutes: number;
  results: string[];
  assumedDays: number;
  partialDays: number;
};

function parseTime(value: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function normalizeTimeInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
}

function formatDuration(minutes: number): string {
  const rounded = Math.max(Math.round(minutes), 0);
  return `${Math.floor(rounded / 60)}시간 ${String(rounded % 60).padStart(2, "0")}분`;
}

function formatClock(minutes: number): string {
  const normalized = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function calculateRows(rows: WorkRow[]): Calculation {
  let confirmedMinutes = 0;
  let assumedDays = 0;
  const partialIndexes: number[] = [];
  const results = rows.map(() => "");

  rows.forEach((row, index) => {
    const start = parseTime(row.start);
    const end = parseTime(row.end);

    if (start !== null && end !== null) {
      let elapsed = end - start;
      if (elapsed < 0) elapsed += 1440;
      const worked = Math.max(elapsed - 60, 0);
      confirmedMinutes += worked;
      results[index] = formatDuration(worked);
      return;
    }

    if (start !== null && row.end === "") {
      partialIndexes.push(index);
      results[index] = "퇴근 시간 계산 중";
      return;
    }

    if (row.start === "" && row.end === "") {
      assumedDays += 1;
      results[index] = "8시간 00분";
      return;
    }

    if (start === null && row.start !== "") {
      results[index] = "출근 시간 확인";
    } else if (end === null && row.end !== "") {
      results[index] = "퇴근 시간 확인";
    } else {
      results[index] = "출근 시간 필요";
    }
  });

  const distributable = Math.max(
    WEEKLY_TARGET_MINUTES - confirmedMinutes - assumedDays * 8 * 60,
    0,
  );
  const requiredPerPartial = partialIndexes.length
    ? distributable / partialIndexes.length
    : 0;

  partialIndexes.forEach((index) => {
    const start = parseTime(rows[index].start);
    if (start === null) return;
    const suggestedEnd = Math.max(15 * 60, start + 60 + requiredPerPartial);
    results[index] = `${formatClock(suggestedEnd)} 퇴근`;
  });

  return {
    confirmedMinutes,
    remainingMinutes: Math.max(WEEKLY_TARGET_MINUTES - confirmedMinutes, 0),
    results,
    assumedDays,
    partialDays: partialIndexes.length,
  };
}

export default function Home() {
  const [rows, setRows] = useState<WorkRow[]>(() =>
    DEFAULT_ROWS.map((row) => ({ ...row })),
  );
  const [calculation, setCalculation] = useState<Calculation>(() =>
    calculateRows(DEFAULT_ROWS.map((row) => ({ ...row }))),
  );
  const [isDirty, setIsDirty] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [statusMessage, setStatusMessage] = useState("입력 내용은 이 기기에 자동 저장됩니다.");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Array<{ start?: string; end?: string }>;
        if (Array.isArray(saved) && saved.length === 5) {
          const restored = DEFAULT_ROWS.map((row, index) => ({
            ...row,
            start: typeof saved[index]?.start === "string" ? saved[index].start : "",
            end: typeof saved[index]?.end === "string" ? saved[index].end : "",
          }));
          setRows(restored);
          setCalculation(calculateRows(restored));
        }
      }
    } catch {
      setStatusMessage("저장된 내용을 읽지 못해 새로 시작했습니다.");
    } finally {
      setHasLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoaded) return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(rows.map(({ start, end }) => ({ start, end }))),
    );
  }, [rows, hasLoaded]);

  const progress = useMemo(
    () => Math.min((calculation.confirmedMinutes / WEEKLY_TARGET_MINUTES) * 100, 100),
    [calculation.confirmedMinutes],
  );

  function updateRow(index: number, field: "start" | "end", value: string) {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, [field]: normalizeTimeInput(value) } : row,
      ),
    );
    setIsDirty(true);
    setStatusMessage("입력이 변경되었습니다. 다시 계산해 주세요.");
  }

  function fillEightHours(index: number) {
    const nextRows = rows.map((row, rowIndex) =>
      rowIndex === index ? { ...row, start: "09:00", end: "18:00" } : row,
    );
    setRows(nextRows);
    setCalculation(calculateRows(nextRows));
    setIsDirty(false);
    setStatusMessage(`${rows[index].day}을 09:00–18:00로 채웠습니다.`);
  }

  function calculate() {
    setCalculation(calculateRows(rows));
    setIsDirty(false);
    setStatusMessage("이번 주 근무 시간을 계산했습니다.");
  }

  function clearAll() {
    const cleared = DEFAULT_ROWS.map((row) => ({ ...row }));
    setRows(cleared);
    setCalculation(calculateRows(cleared));
    setIsDirty(false);
    window.localStorage.removeItem(STORAGE_KEY);
    setStatusMessage("모든 입력을 초기화했습니다.");
  }

  return (
    <main className="app-shell">
      <section className="calculator" aria-labelledby="page-title">
        <header className="hero">
          <div>
            <p className="eyebrow">WEEKLY WORK PLANNER</p>
            <h1 id="page-title">퇴근 시간 계산기</h1>
            <p className="hero-copy">
              이번 주 출퇴근 시간을 적으면, 40시간을 채우는 퇴근 시간을 계산해 드려요.
            </p>
          </div>
          <div
            className="progress-ring"
            style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}
            aria-label={`확정 근무 시간 달성률 ${Math.round(progress)}퍼센트`}
          >
            <div className="progress-inner">
              <strong>{Math.round(progress)}%</strong>
              <span>확정</span>
            </div>
          </div>
        </header>

        <div className="summary-grid" aria-live="polite">
          <div className="summary-card primary">
            <span>확정 근무 시간</span>
            <strong>{formatDuration(calculation.confirmedMinutes)}</strong>
          </div>
          <div className="summary-card">
            <span>40시간까지</span>
            <strong>{formatDuration(calculation.remainingMinutes)}</strong>
          </div>
        </div>

        <div className="table-heading" aria-hidden="true">
          <span>요일</span>
          <span>출근</span>
          <span>퇴근</span>
          <span>빠른 입력</span>
          <span>계산 결과</span>
        </div>

        <div className="workweek">
          {rows.map((row, index) => {
            const startInvalid = row.start !== "" && parseTime(row.start) === null;
            const endInvalid = row.end !== "" && parseTime(row.end) === null;

            return (
              <article className="day-row" key={row.day}>
                <div className="day-badge" aria-label={row.day}>
                  <span>{row.shortDay}</span>
                  <small>{row.day}</small>
                </div>

                <label className="time-field">
                  <span>출근</span>
                  <input
                    aria-label={`${row.day} 출근 시간`}
                    aria-invalid={startInvalid}
                    className={startInvalid ? "invalid" : ""}
                    inputMode="numeric"
                    maxLength={5}
                    onChange={(event) => updateRow(index, "start", event.target.value)}
                    placeholder="09:00"
                    value={row.start}
                  />
                </label>

                <label className="time-field">
                  <span>퇴근</span>
                  <input
                    aria-label={`${row.day} 퇴근 시간`}
                    aria-invalid={endInvalid}
                    className={endInvalid ? "invalid" : ""}
                    inputMode="numeric"
                    maxLength={5}
                    onChange={(event) => updateRow(index, "end", event.target.value)}
                    placeholder="18:00"
                    value={row.end}
                  />
                </label>

                <button
                  className="fill-button"
                  onClick={() => fillEightHours(index)}
                  type="button"
                >
                  <span aria-hidden="true">＋</span> 8시간
                </button>

                <output className="row-result">
                  <span>계산 결과</span>
                  <strong>{calculation.results[index]}</strong>
                </output>
              </article>
            );
          })}
        </div>

        <div className="actions">
          <button className="calculate-button" onClick={calculate} type="button">
            {isDirty ? "다시 계산하기" : "계산하기"}
            <span aria-hidden="true">→</span>
          </button>
          <button className="clear-button" onClick={clearAll} type="button">
            초기화
          </button>
        </div>

        <p className="status-message" role="status">
          <span aria-hidden="true">●</span> {statusMessage}
        </p>

        <aside className="rule-note" aria-label="계산 기준">
          <div className="note-icon" aria-hidden="true">i</div>
          <div>
            <strong>계산 기준</strong>
            <p>
              하루 1시간의 휴게 시간을 빼고 계산합니다. 비어 있는 요일은 8시간 근무로 보고,
              퇴근 시간 추천은 오후 3시보다 이르지 않게 잡습니다.
            </p>
          </div>
        </aside>

        {(calculation.assumedDays > 0 || calculation.partialDays > 0) && (
          <p className="assumption-copy">
            현재 빈 요일 {calculation.assumedDays}일, 퇴근 시간이 필요한 요일 {calculation.partialDays}일을
            반영했습니다.
          </p>
        )}
      </section>
    </main>
  );
}
