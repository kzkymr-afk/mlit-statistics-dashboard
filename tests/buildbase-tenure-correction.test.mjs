import assert from 'node:assert/strict';
import test from 'node:test';
import {correctTenure,targetSeriesId,correction} from '../scripts/prepare-buildbase-corrections.mjs';

function fixture(value=1) {return {series:{[targetSeriesId]:['年','x7ff',[['2024100000',18.3,null,'source',null],['2025100000',value,null,'source',null]]],other:['年','x1',[['2025100000',1,null,'other',null]]]}};}
test('only the approved cell changes, retaining source and adjacent values',()=>{
 const data=fixture(),expected=structuredClone(data);expected.series[targetSeriesId][2][1][1]=17.8;
 assert.equal(correctTenure(data),true);assert.deepEqual(data,expected);
 assert.equal(correctTenure(data),false);assert.deepEqual(data,expected);
});
test('unexpected source value fails without mutation',()=>{const data=fixture(2),before=structuredClone(data);assert.throws(()=>correctTenure(data));assert.deepEqual(data,before);});
test('unit, absent year, duplicate year and nonnumeric status are rejected',()=>{
 for(const mutate of [d=>d.series[targetSeriesId][0]='人',d=>d.series[targetSeriesId][2].pop(),d=>d.series[targetSeriesId][2].push([...d.series[targetSeriesId][2][1]]),d=>d.series[targetSeriesId][2][1][2]='missing']){
  const d=fixture();mutate(d);assert.throws(()=>correctTenure(d));
 }
});
test('provenance identifies the standalone year-end table and native fact',()=>{
 assert.equal(correction.periodEnd,'2026-03-31');assert.equal(correction.scope,'standalone');assert.equal(correction.pdfPage,89);assert.equal(correction.sourceDocumentId,'S100YCGY');assert.match(correction.sourceConcept,/AverageLengthOfService/);
});
