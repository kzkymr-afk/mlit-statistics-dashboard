#!/usr/bin/env python3
"""Project the reviewed Source usage matrix into a bounded, read-only Atlas asset.

Usage: python3 scripts/build-financial-usage-public.py SOURCE_ROOT
The Source tree is read only. The output contains a strict field allowlist.
"""
import gzip
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1]) if len(sys.argv) == 2 else None
if SOURCE is None:
    raise SystemExit('Pass the verified Source root explicitly')
GUIDE = SOURCE / 'data/quality/financial_coverage/20261017_financial_market_usage_guide'
ALLOWED_HOSTS = set('ssl4.eir-parts.net ir.obayashi.co.jp pdf.irpocket.com www.haseko.co.jp www.nishimatsu.co.jp www.ad-hzm.co.jp www.penta-ocean.co.jp www.takenaka.co.jp www.smcon.co.jp www2.jpx.co.jp www.kajima.co.jp www.okumuragumi.co.jp www.toda.co.jp www.taisei.co.jp www.zenitaka.co.jp www.asanuma.co.jp www.matsui-ken.co.jp www.kumagaigumi.co.jp www.infroneer.com disclosure2dl.edinet-fsa.go.jp'.split())
PRIVATE = re.compile(r'/Volumes/|/Users/|file://|data/raw/|https?://github\.com/|(?:^|[/?&])(token|secret|password|key|signature|credential)=', re.I)
BUCKETS = {'automatic': 20, 'annotated_comparison': 659, 'prohibited_total_NetAssets_alias': 1, 'unreviewed': 0, 'reported_basis_pending': 42, 'target_context_pending': 10, 'source_reconciliation_pending': 1, 'individual_counterpart_waiting': 667}


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def official_url(value):
    parsed = urlsplit(value or '')
    if parsed.scheme != 'https' or parsed.hostname not in ALLOWED_HOSTS or parsed.username or parsed.password or PRIVATE.search(value):
        raise ValueError('Unapproved official source URL')
    return value


def strings_safe(value):
    if isinstance(value, str):
        if PRIVATE.search(value):
            raise ValueError('Private reference in public projection')
    elif isinstance(value, list):
        for item in value: strings_safe(item)
    elif isinstance(value, dict):
        for item in value.values(): strings_safe(item)


matrix = json.loads((GUIDE / 'usage-matrix.json').read_text())
expected_buckets = dict(BUCKETS)
if (matrix['partition_counts'].get('annotated_comparison'), matrix['partition_counts'].get('individual_counterpart_waiting')) == (660, 666):
    # Only the separately reviewed one-pair HASEKO change is accepted as a future regeneration shape.
    expected_buckets.update(annotated_comparison=660, individual_counterpart_waiting=666)
if len(matrix['records_by_id']) != 1400 or matrix['partition_counts'] != expected_buckets:
    raise ValueError('Verified usage partition changed; review before publication')
ids = set(matrix['records_by_id'])
facts = {}
with (SOURCE / 'data/marts/public_disclosures/facts_effective.jsonl').open() as stream:
    for line in stream:
        fact = json.loads(line)
        if fact['fact_id'] in ids:
            if fact['fact_id'] in facts: raise ValueError('Duplicate source fact')
            facts[fact['fact_id']] = fact
if set(facts) != ids:
    raise ValueError('Original fact set does not match 1,400 review IDs')
rows = []
for fact_id, review in sorted(matrix['records_by_id'].items()):
    fact = facts[fact_id]
    source = review['source']
    if (fact['company_id'] != review['company_id'] or str(fact['fiscal_year']) != str(review['fiscal_year']) or
        (fact.get('source_file_sha256') or fact.get('document_version_sha256')) != source['recorded_sha256'] or not review['core_basic_eligibility']['eligible']):
        raise ValueError('Source fact identity or eligibility mismatch')
    if fact['value'] is None or isinstance(fact['value'], bool):
        raise ValueError('Unreviewed numeric projection')
    url = official_url(source['source_url'])
    refs = review['existing_declaration_refs']
    if review['automatic_contract']:
        refs = refs + ['automatic:' + fact_id]
    contract_ids = [hashlib.sha256(ref.encode()).hexdigest()[:16] for ref in refs]
    period = review['period']
    row = {
        'id': fact_id,
        'companyId': review['company_id'], 'companyName': review['company_name'],
        'fiscalYear': str(review['fiscal_year']), 'metricId': review['source_metric_id'], 'metricLabel': review['metric_label'],
        'nativeDetails': review['native_details'], 'value': str(fact['value']), 'valueAsDisplayed': fact.get('value_raw'),
        'unit': review['unit'], 'currency': review['currency'], 'scope': review['scope'], 'scopeLabel': review['scope_label'],
        'accountingStandard': review['accounting_standard'],
        'period': {'start': period.get('start'), 'end': period.get('end'), 'asOf': period.get('as_of'),
                   'measureKind': period.get('measure_kind'), 'originalLabel': period.get('original_label'),
                   'precisionStatus': period.get('precision_status')},
        'bucket': review['bucket'], 'bucketLabel': review['bucket_label'], 'allowedUse': review['allowed_use'],
        'conditions': review['conditions'], 'prohibitedUses': review['prohibited_uses'],
        'specificUnconfirmedReasons': review['specific_unconfirmed_reasons'], 'contractIds': contract_ids,
        'source': {'url': url, 'documentName': unquote(urlsplit(url).path.rsplit('/', 1)[-1]),
                   'sha256': source['recorded_sha256'], 'page': source['physical_page'],
                   'retrievedAt': fact.get('retrieved_at'), 'currentOfficialVersionMatchStatus': fact.get('current_official_version_match_status')},
    }
    strings_safe(row)
    rows.append(row)
counts = dict(Counter(row['bucket'] for row in rows))
if counts != {k: v for k, v in expected_buckets.items() if v}:
    raise ValueError('Projected review buckets differ')
asset = {'schemaVersion': 1, 'datasetId': 'buildbase-financial-usage-public',
         'sourceQualitySha256': matrix['source_quality_sha256'], 'recordCount': len(rows),
         'partitionCounts': expected_buckets, 'records': rows,
         'permissions': {'automaticAggregationAllowed': False,
                         'newComparisonPermissionCreated': False,
                         'browseOnly': True}}
projection_hash = hashlib.sha256(canonical(asset).encode()).hexdigest()
catalog = {'schemaVersion': 1, 'datasetId': asset['datasetId'], 'recordCount': len(rows),
           'companyCount': len({row['companyId'] for row in rows}), 'partitionCounts': expected_buckets,
           'sourceQualitySha256': matrix['source_quality_sha256'], 'projectionHash': projection_hash,
           'dataUrl': 'explorer/financial-usage.json.gz'}
out = ROOT / 'public/explorer'
with (out / 'financial-usage.json.gz').open('wb') as stream:
    with gzip.GzipFile(fileobj=stream, mode='wb', filename='', mtime=0, compresslevel=9) as zipped:
        zipped.write(canonical(asset).encode())
(out / 'financial-usage.catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, sort_keys=True, indent=2) + '\n')
print(json.dumps({'records': len(rows), 'counts': counts, 'projectionHash': projection_hash}, ensure_ascii=False))
