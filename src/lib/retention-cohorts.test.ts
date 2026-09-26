import { describe,it,expect } from 'vitest';
import { COHORT_TEMPLATE, cohortTotals,parseCohorts } from './retention-cohorts';
describe('calendar week aggregate retention',()=>{
  it('weights by eligible cohort denominators, not mean percentages',()=>{
    const report=parseCohorts({...COHORT_TEMPLATE,cohorts:[{weekStart:'2026-08-31',size:10,retained:[10,2]},{weekStart:'2026-08-24',size:100,retained:[100,40]}]});
    expect(cohortTotals(report)[1]).toEqual({period:1,denominator:110,retained:42});
  });
  it('keeps missing/immature distinct from actual zero',()=>{
    const report=parseCohorts({...COHORT_TEMPLATE,cohorts:[{weekStart:'2026-08-31',size:10,retained:[10,0,null]},{weekStart:'2026-09-07',size:5,retained:[5,null,null]}]});
    expect(cohortTotals(report)[1]).toEqual({period:1,denominator:10,retained:0});expect(cohortTotals(report)[2].denominator).toBe(0);
    expect(()=>parseCohorts({...COHORT_TEMPLATE,cohorts:[{weekStart:'2026-09-07',size:5,retained:[5,0]}]})).toThrow();
  });
  it('rejects invalid counts, duplicate cohorts, non-monday start and wrong W0',()=>{
    for(const row of [{weekStart:'2026-09-07',size:2,retained:[3]},{weekStart:'2026-09-08',size:2,retained:[2]},{weekStart:'2026-09-07',size:2,retained:[1]}])expect(()=>parseCohorts({...COHORT_TEMPLATE,cohorts:[row]})).toThrow();
    expect(()=>parseCohorts({...COHORT_TEMPLATE,cohorts:[{weekStart:'2026-09-07',size:2,retained:[2]},{weekStart:'2026-09-07',size:3,retained:[3]}]})).toThrow();
    expect(()=>parseCohorts({...COHORT_TEMPLATE,mode:'scripted_demo'})).toThrow();
  });
});
