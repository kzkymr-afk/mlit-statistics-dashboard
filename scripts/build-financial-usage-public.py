#!/usr/bin/env python3
"""Build the fixed 1,400-row, browse-only public snapshot from reviewed Source views.

Usage: python3 scripts/build-financial-usage-public.py SOURCE_ROOT
Source is read only. No historical saved-cell values or private paths are exported.
"""
import gzip
import hashlib
import importlib.util
import json
import re
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1]).resolve() if len(sys.argv) == 2 else None
if SOURCE is None:
    raise SystemExit('Pass the verified Source root explicitly')
GUIDE = SOURCE / 'data/quality/financial_coverage/20261017_financial_market_usage_guide'
OVERLAY = SOURCE / 'data/quality/financial_coverage/20261018_saved_cells_stock_dates'
CONSTRAINTS = SOURCE / 'config/reviewed_saved_financial_usage_constraints_20261018.json'
ALLOWED_HOSTS = set('ssl4.eir-parts.net ir.obayashi.co.jp pdf.irpocket.com www.haseko.co.jp www.nishimatsu.co.jp www.ad-hzm.co.jp www.penta-ocean.co.jp www.takenaka.co.jp www.smcon.co.jp www2.jpx.co.jp www.kajima.co.jp www.okumuragumi.co.jp www.toda.co.jp www.taisei.co.jp www.zenitaka.co.jp www.asanuma.co.jp www.matsui-ken.co.jp www.kumagaigumi.co.jp www.infroneer.com disclosure2dl.edinet-fsa.go.jp'.split())
PRIVATE = re.compile(r'/Volumes/|/Users/|file://|data/raw/|https?://github\.com/|(?:^|[/?&])(token|secret|password|key|signature|credential)=', re.I)
BUCKETS = {'automatic': 20, 'annotated_comparison': 970, 'prohibited_total_NetAssets_alias': 1, 'unreviewed': 0, 'reported_basis_pending': 42, 'target_context_pending': 10, 'source_reconciliation_pending': 1, 'individual_counterpart_waiting': 356}
PINS = {'usage_delta': 'dabd49c60a2799545c6bfc1611cb50ef52eda6962f63c2b81db610188fb9cf24',
        'quality_delta': '5e33a74b438e9fc664f147b755fe7940446eedc4fa765c5893d9d919b5265299',
        'constraints': 'de1e0f208f041cc6ca2ba0968f04f115e98f3ec3eaacd6dab41b839393d1731e',
        'quality_view': '07f5d5c735a1b51daba5c20581c7826b9be2320180f845f9b3051f029cec5eec',
        'usage_view': 'bc55c835f239701156beab0252432473706f401ae354f049c359d59295cfb7e2'}

def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
def sha_bytes(value):
    return hashlib.sha256(value).hexdigest()
def file_sha(path):
    return sha_bytes(path.read_bytes())
def official_url(value):
    parsed = urlsplit(value or '')
    if parsed.scheme != 'https' or parsed.hostname not in ALLOWED_HOSTS or parsed.username or parsed.password or PRIVATE.search(value):
        raise ValueError('Unapproved official source URL')
    return value
def strings_safe(value):
    if isinstance(value, str):
        if PRIVATE.search(value): raise ValueError('Private reference in public projection')
    elif isinstance(value, list):
        for item in value: strings_safe(item)
    elif isinstance(value, dict):
        for item in value.values(): strings_safe(item)
def unique(values):
    return list(dict.fromkeys(values))

for name, path in [('usage_delta', OVERLAY/'usage-delta.json'), ('quality_delta', OVERLAY/'quality-delta.json'), ('constraints', CONSTRAINTS)]:
    if file_sha(path) != PINS[name]: raise ValueError(f'Unexpected reviewed Source {name} version')
spec = importlib.util.spec_from_file_location('reviewed_saved_cells_snapshot', OVERLAY/'verify_unit.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
_, usage = module.view('usage-delta.json')
_, quality = module.view('quality-delta.json')
if sha_bytes(canonical(usage).encode()) != PINS['usage_view'] or sha_bytes(canonical(quality).encode()) != PINS['quality_view']:
    raise ValueError('Reviewed Source view changed')
base = json.loads((GUIDE/'usage-matrix.json').read_text())
if set(usage) != set(quality) or set(usage) != set(base['records_by_id']) or len(usage) != 1400:
    raise ValueError('Verified 1,400 IDs changed')
if dict(Counter(row['bucket'] for row in usage.values())) != {key:value for key,value in BUCKETS.items() if value}:
    raise ValueError('Verified usage partition changed')
constraints = json.loads(CONSTRAINTS.read_text())
if constraints['schema'] != 'saved-series-usage-constraints-v1' or set(constraints['constraints_by_current_fact_id']) - set(usage):
    raise ValueError('Saved-series constraint coverage changed')
for kind in ('usage', 'quality'):
    if constraints['source_ledgers'][kind]['sha256'] != PINS[kind+'_delta']:
        raise ValueError('Saved-series ledger pin changed')

ids = set(usage)
facts = {}
source_fact_count = 0
with (SOURCE/'data/marts/public_disclosures/facts_effective.jsonl').open() as stream:
    for line in stream:
        source_fact_count += 1
        fact = json.loads(line)
        if fact['fact_id'] in ids:
            if fact['fact_id'] in facts: raise ValueError('Duplicate source fact')
            facts[fact['fact_id']] = fact
if source_fact_count != 19054 or set(facts) != ids: raise ValueError('Original fact set does not match verified 1,400 review IDs')

rows = []
for fact_id, review in sorted(usage.items()):
    fact = facts[fact_id]
    source = review['source']
    if (fact['company_id'] != review['company_id'] or str(fact['fiscal_year']) != str(review['fiscal_year']) or
        (fact.get('source_file_sha256') or fact.get('document_version_sha256')) != source['recorded_sha256'] or
        not review['core_basic_eligibility']['eligible'] or quality[fact_id]['fact_id'] != fact_id):
        raise ValueError('Source fact identity or eligibility mismatch')
    if fact['value'] is None or isinstance(fact['value'], bool): raise ValueError('Unreviewed numeric projection')
    url = official_url(source['source_url'])
    binding = constraints['constraints_by_current_fact_id'].get(fact_id)
    series = None
    refs = list(review['existing_declaration_refs'])
    if review['automatic_contract']: refs.append('automatic:'+fact_id)
    conditions = list(review['conditions'])
    prohibited = list(review['prohibited_uses'])
    if binding:
        q,u = binding['quality_row'],binding['usage_row']
        if u != review or q != quality[fact_id] or q['fact_id'] != fact_id:
            raise ValueError('Current-year constraint differs from reviewed ledger')
        fixed = u['saved_source_series_contract']
        if not fixed or fixed['automatic_comparison_allowed'] or fixed['precise_delta_allowed'] or fixed['relative_growth_allowed'] or not fixed['source_cells_are_not_fact_ids']:
            raise ValueError('Saved-series permission widened')
        refs.append(fixed['contract_id'])
        conditions = unique(conditions + q['conditions'] + u['conditions'] + q['saved_series_conditions'] + u['saved_series_conditions'])
        prohibited = unique(prohibited + q['prohibited_uses'] + u['prohibited_uses'])
        target = u.get('original_specified_target_use_contract_ref') or {}
        series = {'appliesToCurrentFactId': fact_id, 'appliesToFiscalYear': str(review['fiscal_year']),
                  'availableUse': u['source_series_available_use'], 'comparisonPrecision': u.get('comparison_precision'),
                  'remainingRequirement': u.get('saved_series_remaining_requirement'),
                  'historicalBasisVerifiedByCurrentConditions': False, 'currentYearBasisTransferAllowed': False,
                  'automaticComparisonAllowed': False, 'automaticAggregationAllowed': False,
                  'preciseDeltaAllowed': False, 'relativeGrowthAllowed': False,
                  'sourceSeriesPublicationAllowed': False, 'sourceCellsAreNotFacts': True,
                  'specifiedTargetUse': {'targetUse': target.get('target_use'), 'status': target.get('status')},
                  'ledgerReferences': {kind: {'sha256': PINS[kind+'_delta'], 'jsonPointer': '/replacements_by_id/'+fact_id}
                                       for kind in ('quality','usage')}}
    period = review['period']
    row = {
        'id': fact_id, 'companyId': review['company_id'], 'companyName': review['company_name'],
        'fiscalYear': str(review['fiscal_year']), 'metricId': review['source_metric_id'], 'metricLabel': review['metric_label'],
        'nativeDetails': review['native_details'], 'value': str(fact['value']), 'valueAsDisplayed': fact.get('value_raw'),
        'unit': review['unit'], 'currency': review['currency'], 'scope': review['scope'], 'scopeLabel': review['scope_label'],
        'accountingStandard': review['accounting_standard'],
        'period': {'start': period.get('start'), 'end': period.get('end'), 'asOf': period.get('as_of'),
                   'measureKind': period.get('measure_kind'), 'originalLabel': period.get('original_label'),
                   'precisionStatus': period.get('precision_status')},
        'bucket': review['bucket'], 'bucketLabel': review['bucket_label'], 'allowedUse': review['allowed_use'],
        'conditions': conditions, 'prohibitedUses': prohibited,
        'specificUnconfirmedReasons': review['specific_unconfirmed_reasons'],
        'contractIds': [sha_bytes(ref.encode())[:16] for ref in refs], 'currentYearSeriesRestrictions': series,
        'source': {'url': url, 'documentName': unquote(urlsplit(url).path.rsplit('/', 1)[-1]),
                   'sha256': source['recorded_sha256'], 'page': source['physical_page'],
                   'retrievedAt': fact.get('retrieved_at'), 'currentOfficialVersionMatchStatus': fact.get('current_official_version_match_status')},
    }
    strings_safe(row)
    rows.append(row)
counts = dict(Counter(row['bucket'] for row in rows))
if counts != {k:v for k,v in BUCKETS.items() if v}: raise ValueError('Projected review buckets differ')
if sum(row['currentYearSeriesRestrictions'] is not None for row in rows) != 263:
    raise ValueError('Current-year saved-series restrictions missing')
asset = {'schemaVersion': 2, 'datasetId': 'buildbase-financial-usage-public',
         'sourceQualitySha256': PINS['quality_view'], 'sourceUsageSha256': PINS['usage_view'],
         'sourceLedgerSha256': {'quality': PINS['quality_delta'], 'usage': PINS['usage_delta'], 'constraints': PINS['constraints']},
         'recordCount': len(rows), 'partitionCounts': BUCKETS, 'records': rows,
         'permissions': {'automaticAggregationAllowed': False, 'newComparisonPermissionCreated': False, 'browseOnly': True,
                         'historicalSourceCellsPublished': False}}
projection_hash = sha_bytes(canonical(asset).encode())
catalog = {'schemaVersion': 2, 'datasetId': asset['datasetId'], 'recordCount': len(rows),
           'companyCount': len({row['companyId'] for row in rows}), 'partitionCounts': BUCKETS,
           'sourceQualitySha256': PINS['quality_view'], 'sourceUsageSha256': PINS['usage_view'],
           'sourceLedgerSha256': asset['sourceLedgerSha256'], 'projectionHash': projection_hash,
           'dataUrl': 'explorer/financial-usage.json.gz'}
out = ROOT/'public/explorer'
with (out/'financial-usage.json.gz').open('wb') as stream:
    with gzip.GzipFile(fileobj=stream, mode='wb', filename='', mtime=0, compresslevel=9) as zipped:
        zipped.write(canonical(asset).encode())
(out/'financial-usage.catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, sort_keys=True, indent=2)+'\n')
print(json.dumps({'records':len(rows),'counts':counts,'restrictedCurrentYearRows':263,'projectionHash':projection_hash},ensure_ascii=False))
