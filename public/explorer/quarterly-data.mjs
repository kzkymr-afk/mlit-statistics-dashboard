import {STATEMENT_DOCUMENTS,STATEMENT_RECORD_KEYS,STATEMENT_EXTRACTOR,assertStatementPublicRecord} from './quarterly-statement-registry.mjs';
import {canonicalSha256} from './lib/buildbase-contract-hash.mjs';
import {serializeCsv} from './data-view.mjs';
import {QUARTER_EXPANSION_PROFILES,QUARTER_EXPANSION_DOCUMENTS,QUARTER_EXPANSION_RECORD_KEYS,QUARTER_EXPANSION_LOCATOR_KEYS,QUARTER_EXPANSION_AVAILABILITY_KEYS,QUARTER_EXPANSION_ANNOTATION_KEYS} from './quarterly-expansion-registry.mjs';
export const QUARTER_EXTRACTORS=['reviewed_kitano_q3_summary_segments_v1','reviewed_kitano_q1_summary_v1','reviewed_obayashi_kajima_quarterly_fy2025_v1','reviewed_haseko_ando_hazama_quarterly_fy2025_v1','reviewed_okumura_asanuma_quarterly_fy2025_v1','reviewed_zenitaka_kumagai_quarterly_fy2025_v1','reviewed_infr_nishimatsu_quarterly_fy2025_v1','reviewed_shimizu_toda_quarterly_fy2025_v1',...QUARTER_EXPANSION_PROFILES.map(p=>p.extractorVersion),STATEMENT_EXTRACTOR];
export const QUARTER_PERMISSION_KEYS=['financeEligibleAsDirectReportedFact','automaticComparisonAllowed','automaticAggregationAllowed','canonicalFactPromotionAllowed'];
export const QUARTER_RECORD_KEYS=new Set(('actual_or_forecast adjustment_source_note as_of_check_utc as_of_check_utc_status as_of_date as_of_status automatic_aggregation_allowed automatic_comparison_allowed candidate_disposition company_id corroborating_evidence_ids corroborating_source_quote currency data_scope document_id document_version_sha256 evidence_id extractor_version fact_id finance_eligible fiscal_year is_additive_leaf is_reconciliation_adjustment is_reported_subtotal is_reported_total metric_id official_fiscal_year_label period_end period_end_month period_interval_status period_kind period_label period_label_as_disclosed period_start period_type record_kind reporting_entity_id retrieved_at retrieved_at_basis share_split_basis_source_locator share_split_comparative_basis share_split_source_note source_acquisition_date source_acquisition_timestamp_status source_cell_id source_column_label_as_disclosed source_column_role source_dataset_id source_document_type source_edition_date_as_disclosed source_family source_file_sha256 source_fiscal_year_as_indexed source_index_year_status source_locator source_metric_label source_page_evidence_id source_period_heading source_period_quote source_quote source_quote_kind source_quote_occurrence_count source_reporting_scope source_revenue_recognition_timing source_row_role source_segment_label source_text source_url status target_company_period_id topic unit unit_conversion_rule value value_raw whole_document_review_status permissions').split(' '));
export const QUARTER_LOCATOR_KEYS=new Set(('bbox_page_points_top_left column column_id column_label date_range_as_disclosed note_kind pdf_page period_column period_heading_as_disclosed period_provenance period_quote period_quote_kind primary_summary_cell printed_page row_id row_label row_label_bbox_page_points_top_left section source_blank_slot_bbox source_cell_id source_value_bbox statement_cell table unit_header value_bbox_page_points_top_left').split(' '));
QUARTER_RECORD_KEYS.add('same_byte_index_conflict');
export const QUARTER_LEGACY_RECORD_KEYS=new Set(QUARTER_RECORD_KEYS);
export const QUARTER_LEGACY_LOCATOR_KEYS=new Set(QUARTER_LOCATOR_KEYS);
for(const key of ('current_official_version_match_status display_precision_as_disclosed reported_category_as_disclosed semantic_overlap_group semantic_overlap_status source_category_as_disclosed source_document_type_as_indexed source_notes source_order_dimensions source_period_semantics source_quarter_number source_restatement_basis source_row_hierarchy source_title_as_disclosed source_url_basis source_version_status').split(' '))QUARTER_RECORD_KEYS.add(key);
export const QUARTER_FINANCIAL_META_KEYS=new Set(('bbox coordinate_system pdfplumber_page_bbox_origin pdf_page_rotation native_header_guards period_binding_basis quote status source_quote source_locator limitation method exact_dates_printed_on_selected_table fiscal_metadata_document_id fiscal_metadata_sha256 prior_annual_basis_fact_id prior_annual_basis_source_file_sha256 source_fiscal_group_as_disclosed source_period_label_as_disclosed relation_to_original_prior_edition current_official_version_match_status business_scope construction_type geography').split(' '));
for(const key of QUARTER_FINANCIAL_META_KEYS)QUARTER_LOCATOR_KEYS.add(key);
export const QUARTER_DOCUMENTS={
 reviewed_kitano_q3_summary_segments_v1:{sourceUrl:'https://www.kitano.co.jp/wp-content/uploads/2026/02/IR20260210-1.pdf',sha256:'7dd4a48007f552890fccf0661ae12056ff8941432d4a6a0430b789d0f79693d2',count:105},
 reviewed_kitano_q1_summary_v1:{sourceUrl:'https://www.kitano.co.jp/wp-content/uploads/2025/08/IR20250807001-1.pdf',sha256:'2f05a4d02a8d572a62a3a2fb605f6c77a12cf675722cde4a868498710d876bd4',count:8}
};
export const QUARTER_NEW_DOCUMENTS=[
 ['OBAYASHI','https://data.swcms.net/file/obayashi-ir/dam/jcr:bd453723-8141-4508-8f01-a7e35fc66917/140120250807535695.pdf','62bd8389953df70fc2e9900b1461d0a2d7af613fdb22e5ed92e611f744d9a593','results_explanation',18],
 ['OBAYASHI','https://data.swcms.net/file/obayashi-ir/dam/jcr:b368a092-c85f-4ea0-86f6-1c3548e5cf11/140120251104587256.pdf','f017e4ab2f89d8dbd6d73b750e1ada7bfdc86c011e97bbe6fb866c2265c03620','results_explanation',18],
 ['OBAYASHI','https://data.swcms.net/file/obayashi-ir/dam/jcr:0f4b24d2-5b4e-450d-8198-58cbf1e3f683/140120260206550663.pdf','90ca13160e88863a45f742347291623049bc09f474b0c74b01f2073414fa8373','results_explanation',18],
 ['KAJIMA','https://www.kajima.co.jp/ir/presentation/pdf/reference-20250806-j.pdf','5902fb1145f9f8546d377444ac1afe293cf1607b158e793d96a7058af56e0e7e','financial_results_reference',14],
 ['KAJIMA','https://www.kajima.co.jp/ir/presentation/pdf/reference-20251111-j.pdf','5c93c79814c127242f02e377b858a7d99f96637779a8b9be272f60683fd5965e','financial_results_reference',14],
 ['KAJIMA','https://www.kajima.co.jp/ir/presentation/pdf/reference-20260212-j.pdf','2bb447cd2db3d555a840f1a27e48ffd5e7d904019ba6fa769a3dc5be5fba8595','financial_results_reference',14],
 ['KAJIMA','https://www.kajima.co.jp/ir/q_order/pdf/quarterly-20251q-j.pdf','ca14277aebee5e33e31bc09d1ed0216499305c817807fdded21d4aa79b6be12d','quarterly_orders_reference',20],
 ['KAJIMA','https://www.kajima.co.jp/ir/q_order/pdf/quarterly-20252q-j.pdf','8942fa6fbd6723853fcbdcc651710c07c0a2c4d04e2628244d3aa4e9b63a5816','quarterly_orders_reference',20],
 ['KAJIMA','https://www.kajima.co.jp/ir/q_order/pdf/quarterly-20253q-j.pdf','66662a40835578142443941a3d8b6540214dd375e04ec59294d92ca1d1326639','quarterly_orders_reference',20]
].map(([companyId,sourceUrl,sha256,sourceFamily,count])=>({companyId,sourceUrl,sha256,sourceFamily,count,extractorVersion:'reviewed_obayashi_kajima_quarterly_fy2025_v1'}));
export const QUARTER_DOCUMENT_REGISTRY=[...Object.entries(QUARTER_DOCUMENTS).map(([extractorVersion,d])=>({...d,companyId:'KITANO',sourceFamily:'earnings_release',extractorVersion})),...QUARTER_NEW_DOCUMENTS];
export const QUARTER_NEXT_DOCUMENTS=[
 ['HASEKO','https://www.haseko.co.jp/hc/ir/library/pdf/presentation/20250807_2.pdf','6eb0419349afa93b6490ba0db0afddbfa9ef7758755f568f180f4afbc950c326','results_explanation',10],
 ['HASEKO','https://www.haseko.co.jp/hc/ir/library/pdf/presentation/20251112_2.pdf','8af17f56612e61bf0edb9f0a99032ef26764d1c42f390c148669b8957b600728','results_explanation',10],
 ['HASEKO','https://www.haseko.co.jp/hc/ir/library/pdf/presentation/20260212_2.pdf','6422ffc3abf6d7d4ff8b39b3e0cca2dbdf1fa6ce6b71c4dbafd11295b86bebc0','results_explanation',10],
 ['ANDO_HAZAMA','https://www.ad-hzm.co.jp/assets/pdf/ir/statement/2026_1.pdf','0347cd5915889e8ee2413106d7a05422c38fa5aae9127fc7b8e095fe77a4b18e','earnings_release',14],
 ['ANDO_HAZAMA','https://www.ad-hzm.co.jp/assets/pdf/ir/statement/2026_2.pdf','f54cbc98236316e3bbf1a3a5c82317e145929307ecb705ed1345d4d0bf41d607','earnings_release',14],
 ['ANDO_HAZAMA','https://www.ad-hzm.co.jp/assets/pdf/ir/statement/2026_3.pdf','2c1df20398a68a62bfcacd9e4bee1d7ee990f81a836c8dff5d63263b50b3a17d','earnings_release',14]
].map(([companyId,sourceUrl,sha256,sourceFamily,count])=>({companyId,sourceUrl,sha256,sourceFamily,count,extractorVersion:QUARTER_EXTRACTORS[3]}));
QUARTER_DOCUMENT_REGISTRY.push(...QUARTER_NEXT_DOCUMENTS);
export const QUARTER_LATEST_DOCUMENTS=[
 ['OKUMURA','https://www.okumuragumi.co.jp/ir/irinfo/data/20250806_kessan_fact.pdf','b70c43a5b144b1f9370961627480f8ccba701ed208c5098e65691169716934d8'],
 ['OKUMURA','https://www.okumuragumi.co.jp/ir/irinfo/data/20251113_kessan_fact.pdf','7db0dfea0edc2d52e427bf89d68338002e013cb7f8fdc44d316ef8ac743a8723'],
 ['OKUMURA','https://www.okumuragumi.co.jp/ir/irinfo/data/20260213_kessan_fact.pdf','c4647f8ccdfa68ec2b628e83c7dbf983550a0adabc4f1f84e5650aab23beb8c5'],
 ['ASANUMA','https://www.asanuma.co.jp/ir/pdf/kessan/20250819_2.pdf','b1e1b0eae88057b612a98d1b6e41469c341e852c3ce140a7796ee0acea482e78'],
 ['ASANUMA','https://www.asanuma.co.jp/ir/pdf/kessan/20251111_2.pdf','9b7e2338950d63f6c8cd228b51cc2f4345b7c9a254af46fa847de3bcd1677f49'],
 ['ASANUMA','https://www.asanuma.co.jp/ir/pdf/kessan/20260210_2.pdf','2b53666e309b85ce0318fc5488114a059f6ba27fa81780ca926a32b1f8f86081']
].map(([companyId,sourceUrl,sha256])=>({companyId,sourceUrl,sha256,sourceFamily:'results_supplement',count:14,extractorVersion:QUARTER_EXTRACTORS[4]}));
QUARTER_DOCUMENT_REGISTRY.push(...QUARTER_LATEST_DOCUMENTS);
export const QUARTER_PERIOD_COMPANION_REGISTRY=[
 [1,'https://www.asanuma.co.jp/ir/pdf/kessan/20250807_1.pdf','24110fa54d0731960804cbd433184c7f6baaae024989156c2b772f8a24ad1d85'],
 [2,'https://www.asanuma.co.jp/ir/pdf/kessan/20251111_1.pdf','5825bb6b0b38646d7a51d00e67a673da72054cb14626ff9e92809b2ea0c4b7f1'],
 [3,'https://www.asanuma.co.jp/ir/pdf/kessan/20260210_1.pdf','7f48c2b33c237daebbef78574690d5e96b55e0bf85f3a795b951f20bcff5460a']
].map(([quarter,sourceUrl,sha256])=>({companyId:'ASANUMA',quarter,sourceUrl,sha256,purpose:'exact_period_proof_only'}));
export const QUARTER_ZK_DOCUMENTS=[
 ['ZENITAKA',1,'https://www.zenitaka.co.jp/ir/28c680e7ca4b4250967c9a2586c48b73a0f27d69.pdf','072040c2c4b78866feff3a1469968e296815ac39f50008f4a4e5849994c59eae','quarterly_earnings_release',14],
 ['ZENITAKA',2,'https://www.zenitaka.co.jp/ir/2a431659c19eeb381b75a772a23002962980c31a.pdf','e1efd7d6946edd6d3ac8439bec59be937e446a164d0a822440e923a994cc7d82','quarterly_earnings_release',14],
 ['ZENITAKA',3,'https://www.zenitaka.co.jp/ir/shi2603-3.pdf','07eb2ad47446e6ee7158fb1642b478f5265a3fbaa3220953b21f505ab065acac','quarterly_earnings_release',14],
 ['KUMAGAI',1,'https://pdf.irpocket.com/C1861/bffO/mTgf/L2Nh.pdf','9de7f2d85d431dc0c13f990f06d82762909ab0e30fb9f7ae79911f9c370bac3c','quarterly_earnings_release',16],
 ['KUMAGAI',2,'https://www.kumagaigumi.co.jp/ir/uploads/ir_20251120_2.pdf','1845a5849fef970014ec5058ca3695638bd25bda0e81c02abf13c572de0df734','quarterly_earnings_presentation',16],
 ['KUMAGAI',3,'https://pdf.irpocket.com/C1861/YpwX/TObp/i9nC.pdf','8af8911f98a930fbf62440728123ad0bd2105e698fefb0a5506498b10f4ff04a','quarterly_earnings_release',16]
].map(([companyId,quarter,sourceUrl,sha256,sourceFamily,count])=>({companyId,quarter,sourceUrl,sha256,sourceFamily,count,sourceDocumentType:sourceFamily==='quarterly_earnings_presentation'?'quarterly_results_presentation':'quarterly_financial_results_release',extractorVersion:QUARTER_EXTRACTORS[5]}));
QUARTER_DOCUMENT_REGISTRY.push(...QUARTER_ZK_DOCUMENTS);
QUARTER_PERIOD_COMPANION_REGISTRY.push({companyId:'KUMAGAI',quarter:2,sourceUrl:'https://pdf.irpocket.com/C1861/lAG8/iZSB/OvY0.pdf',sha256:'44a0a5bc8a740666e538c61363d2d6f7d4eff2745362e3b9f80aedf3d1324507',purpose:'exact_period_proof_only'});
export const QUARTER_IN_DOCUMENTS=[
 ["INFR",1,"https://www.infroneer.com/pdf/ir/results/FY2025_1Q.pdf","6792f66c026dd36eeca17929a0051591f828dfe75ccda3d6eefd529020b9af0e",8,"2026-10-14T16:36:10.361018+00:00"],
 ["INFR",2,"https://www.infroneer.com/pdf/ir/results/FY2025_2Q.pdf","51931cc0a079884d730210dddaa39b4f2fb59d525997f5b5bbf021f587637fee",8,"2026-10-14T16:36:10.361804+00:00"],
 ["INFR",3,"https://www.infroneer.com/pdf/ir/results/FY2025_3Q.pdf","87b7116bc9b0e0f75a57bf340d1b38eedbef28a5a38a5b5b6e060b093420f75d",8,"2026-10-14T16:36:10.654196+00:00"],
 ["NISHIMATSU",1,"https://ssl4.eir-parts.net/doc/1820/tdnet/2669706/00.pdf","5c038bfde16bfcca646e59e6ba772104f9678789b5995c255d07b80a73062b42",33,"2026-10-14T16:42:30.235268+00:00"],
 ["NISHIMATSU",2,"https://ssl4.eir-parts.net/doc/1820/tdnet/2709165/00.pdf","755d8b5a1d71f0e51e22b977493c663b5edd2de0f96b1f20b71f0a1f0d3cd1e6",33,"2026-10-14T16:42:29.921428+00:00"],
 ["NISHIMATSU",3,"https://ssl4.eir-parts.net/doc/1820/tdnet/2755963/00.pdf","04787737987dd758edccb37b27236a11e0eba2b0c77b0b899ce73e302e7740c6",33,"2026-10-14T16:42:29.920713+00:00"]
].map(([companyId,quarter,sourceUrl,sha256,count,acquiredAtUtc])=>({companyId,quarter,sourceUrl,sha256,count,acquiredAtUtc,sourceDocumentType:'quarterly_results_statement',extractorVersion:QUARTER_EXTRACTORS[6]}));
QUARTER_DOCUMENT_REGISTRY.push(...QUARTER_IN_DOCUMENTS);
export const QUARTER_ST_DOCUMENTS=[
 [
  "SHIMIZU",
  1,
  "https://pdf.irpocket.com/C1803/i6fv/Gae6/pesL.pdf",
  "e4de26f34272a1e5a559a17318178cf53476705888672299a110e0ae7832940c",
  8,
  "2026-10-14T18:05:58.780731+00:00"
 ],
 [
  "SHIMIZU",
  2,
  "https://pdf.irpocket.com/C1803/lAG8/tYJw/btyt.pdf",
  "66429501d4ff11f8b7ac08ef0bde3f8db1c97f29287e1c4d302867a1c7533e20",
  12,
  "2026-10-14T18:05:58.553837+00:00"
 ],
 [
  "SHIMIZU",
  3,
  "https://pdf.irpocket.com/C1803/ikpa/mIVS/u3WO.pdf",
  "4f02a728e98390de98e77e28a4e84409533f9fa112703b73022108147c66b21c",
  12,
  "2026-10-14T18:05:58.553288+00:00"
 ],
 [
  "TODA",
  1,
  "https://www.toda.co.jp/ir/results/assets/pdf/toda_103_2.pdf",
  "e9bb27e91863abfdeb3b85cfa339e30d4e1ca2a5b776558c9a0f11051ee478f3",
  36,
  "2026-10-14T18:02:59.598777+00:00"
 ],
 [
  "TODA",
  2,
  "https://www.toda.co.jp/ir/results/assets/pdf/toda_103_3.pdf",
  "0b1d92fe99818cd69c24b0dfa4fbadf41e92edf53825bee72ce6ad643ed865ae",
  38,
  "2026-10-14T18:02:59.599304+00:00"
 ],
 [
  "TODA",
  3,
  "https://www.toda.co.jp/ir/results/assets/pdf/toda_103_04.pdf",
  "d16f31577f4c964241cbe58a415a6fd274358a8f913c665ac1b2b2421cc7cbf3",
  38,
  "2026-10-14T18:02:59.880162+00:00"
 ]
].map(([companyId,quarter,sourceUrl,sha256,count,acquiredAtUtc])=>({companyId,quarter,sourceUrl,sha256,count,acquiredAtUtc,sourceDocumentType:'quarterly_results_statement',extractorVersion:QUARTER_EXTRACTORS[7]}));
QUARTER_DOCUMENT_REGISTRY.push(...QUARTER_ST_DOCUMENTS);
QUARTER_DOCUMENT_REGISTRY.push(...QUARTER_EXPANSION_DOCUMENTS,...STATEMENT_DOCUMENTS);
export const QUARTER_RECORD_COUNT=QUARTER_DOCUMENT_REGISTRY.reduce((sum,d)=>sum+d.count,0);
export const QUARTER_COMPANY_IDS=[...new Set(QUARTER_DOCUMENT_REGISTRY.map(d=>d.companyId))];
export const QUARTER_COHORT_RECORD_KEYS=new Set([...QUARTER_RECORD_KEYS,'consolidation_perimeter_annotation']);
export const QUARTER_COHORT_LOCATOR_KEYS=new Set([...QUARTER_LOCATOR_KEYS,...('table annual_source_acquisition_id annual_source_period_start annual_source_period_end native_period_column_quote native_period_locator header_bboxes consolidation_scope geographic_scope perimeter_change_assessment selected_native_pdf_page selected_native_scope_quote automatic_comparison_allowed').split(' ')]);
export const QUARTER_LATEST_RECORD_KEYS=new Set([...QUARTER_COHORT_RECORD_KEYS,...('correction_status prior_edition_difference_status period_companion native_period_label source_period_binding_status source_period_start source_period_end source_period_end_as_disclosed source_period_label_as_disclosed').split(' ')]);
export const QUARTER_LATEST_LOCATOR_KEYS=new Set([...QUARTER_COHORT_LOCATOR_KEYS,...('official_url sha256 physical_page page_rotation period_start period_end cover_page financial_page order_page exact_current_dates_printed_on_cover exact_prior_current_dates_printed_on_order_table same_pdf_comparative_date_fragments semantic_label source_quote_kind source_quote_type cross_scope_date_binding_status date_evidence scope_caveat').split(' ')]);
export const QUARTER_PERIOD_COMPANION_KEYS=new Set(('binding_scope bytes date_proofs official_url page_count purpose sha256 listing_link_text bbox page_rotation period_column period_start period_end physical_page quote scope').split(' '));
export const QUARTER_ZK_RECORD_KEYS=new Set([...QUARTER_LATEST_RECORD_KEYS,...('semantic_category_label correction_ids metadata_correction_status').split(' ')]);
export const QUARTER_ZK_LOCATOR_KEYS=new Set([...QUARTER_LATEST_LOCATOR_KEYS,...('fragments exact_dates_printed_on_same_pdf_financial_statement exact_prior_and_current_dates_printed_on_selected_statement native_period_header_fragments native_status_as_received order_table_prints_cumulative_note same_pdf_statement_date_fragments same_pdf_statement_physical_page same_pdf_statement_printed_page selected_orders_page').split(' ')]);
export const QUARTER_ZK_COMPANION_KEYS=new Set([...QUARTER_PERIOD_COMPANION_KEYS,'metric_family']);
export const QUARTER_IN_RECORD_KEYS=new Set([...QUARTER_ZK_RECORD_KEYS,...('accounting_standard_as_disclosed accounting_standard_id source_row_label_as_disclosed source_parent_category_as_disclosed source_url_byte_verification_status source_selected_field_availability').split(' ')]);
export const QUARTER_IN_LOCATOR_KEYS=new Set([...QUARTER_ZK_LOCATOR_KEYS,...('value_bbox corroborating_alias_locators alias_cell_id alias_type guard_bboxes source_row_quote_as_disclosed native_basis period_end_bbox period_end_quote period_proof_id period_start_bbox period_start_quote scope_transfer source_sha256 source_url value_physical_page value_printed_page').split(' ')]);
export const QUARTER_FIELD_AVAILABILITY_KEYS=new Set(('ordinary_profit_consolidated_reported company_wide_non_disclosure_claim physical_page scope source_file_sha256 statement_accounting_label_as_disclosed status').split(' '));
export const QUARTER_ST_RECORD_KEYS=new Set(('accounting_standard_as_disclosed accounting_standard_id actual_or_forecast as_of_check_utc automatic_aggregation_allowed automatic_comparison_allowed company_id correction_status currency current_official_version_match_status data_scope document_id document_version_sha256 evidence_id extractor_version fact_id finance_eligible fiscal_year metric_id period_end period_interval_status period_label_as_disclosed period_start period_type permissions record_kind reporting_entity_id retrieved_at source_acquisition_date source_acquisition_timestamp_status source_category_as_disclosed source_cell_id source_dataset_id source_document_type source_edition_date_as_disclosed source_file_sha256 source_locator source_metric_label source_page_evidence_id source_parent_category_as_disclosed source_period_label_as_disclosed source_precision_status source_quarter_number source_quote source_quote_kind source_restatement_basis source_row_label_as_disclosed source_row_path_as_disclosed source_selected_field_availability source_subject_scope_as_disclosed source_subject_scope_interpretation source_text source_title_as_disclosed source_url source_url_basis source_url_byte_verification_status source_version_status status subject_entity_binding_status subject_entity_id target_company_period_id topic unit unit_conversion_rule value value_raw').split(' '));
export const QUARTER_ST_LOCATOR_KEYS=new Set(('bbox column_label corroborating_alias_locators native_basis native_header_guards pdf_page period_binding_basis period_end_bbox period_end_quote period_start_bbox period_start_quote physical_page printed_page quote row_label semantic_label source_cell_id source_sha256 status table value_bbox_page_points_top_left').split(' '));
export const QUARTER_ST_RESTATEMENT_KEYS=new Set(('applies_to does_not_authorize interpretation native_quote_lines bbox_pt quote physical_page printed_page revision_id source_sha256').split(' '));
export const QUARTER_ST_FIELD_AVAILABILITY_KEYS=new Set(('ordinary_profit_consolidated_reported company_wide_non_disclosure_claim scope source_file_sha256 status').split(' '));
export const QUARTER_HELD_FACT_ID='df84afac72e25d75e0e004009b1baa48a5e2d5c7c2e6442a900fc2c2a99090de';
export const QUARTER_HELD_RECORD_KEYS=new Set(('fact_id company_id reporting_entity_id metric_id extractor_version record_kind hold_reason_code hold_note value value_raw unit currency period_type period_start period_end source_file_sha256 source_url source_locator source_quote document_version_sha256 document_id finance_eligible automatic_comparison_allowed automatic_aggregation_allowed permissions').split(' '));
export const QUARTER_PUBLIC_RECORD_KEYS=new Set([...QUARTER_IN_RECORD_KEYS,...QUARTER_ST_RECORD_KEYS,...QUARTER_EXPANSION_RECORD_KEYS,...QUARTER_HELD_RECORD_KEYS,...STATEMENT_RECORD_KEYS]);
export const QUARTER_PUBLIC_LOCATOR_KEYS=new Set([...QUARTER_IN_LOCATOR_KEYS,...QUARTER_ST_LOCATOR_KEYS,...QUARTER_EXPANSION_LOCATOR_KEYS]);
export const QUARTER_CURRENTNESS_DOCUMENT_REGISTRY=[...QUARTER_NEW_DOCUMENTS,...[
 ['https://ir.obayashi.co.jp/ja/ir/data/results/main/00/teaserItems1/01111/linkList/0/link/20250808kessan3.pdf','ab07806fd641a9d1a172f94d958f974b15ddfe779e3b8b844c7335e00dfbf07d'],
 ['https://ir.obayashi.co.jp/ja/ir/data/results/main/00/teaserItems1/0111/linkList/0/link/20251105kessann3.pdf','8a55e85131e85989054ea072adee674492af8b2dd2e7063db7d13a2332edb1a4'],
 ['https://ir.obayashi.co.jp/ja/ir/data/results/main/00/teaserItems1/01112/linkList/0/link/20260209kessan3.pdf','1f674f28a12be8995977b1c90b35ca48479cb30fcce52718731063160dced729']
].map(([sourceUrl,sha256])=>({companyId:'OBAYASHI',sourceUrl,sha256}))];
export const QUARTER_COMPANY_SEARCH_ALIASES={ANDO_HAZAMA:['安藤ハザマ','安藤・間','安藤間'],HASEKO:['長谷工','長谷工コーポレーション'],ASANUMA:['淺沼組','浅沼組','淺沼','浅沼'],OKUMURA:['奥村組','奥村'],ZENITAKA:['錢高組','銭高組','錢高','銭高'],KUMAGAI:['熊谷組','熊谷'],INFR:['インフロニア','インフロニア・ホールディングス','INFRONEER'],NISHIMATSU:['西松建設','西松'],SHIMIZU:['清水建設','清水'],TODA:['戸田建設','戸田'],TOA:['東亜建設工業','東亜'],MATSUI:['松井建設','松井'],PENTA:['五洋建設','五洋'],TAISEI:['大成建設','大成'],TAKENAKA:['竹中工務店','竹中'],TOKYU:['東急建設','東急'],SMCC:['三井住友建設','三井住友']};
export function quarterNumber(row){return row.source_quarter_number||Number(row.extractor_version===QUARTER_EXTRACTORS[0]?3:row.extractor_version===QUARTER_EXTRACTORS[1]?1:0);}
export function quarterlyRecordCounts(records){return {recordCount:records.length,q1RecordCount:records.filter(r=>quarterNumber(r)===1).length,q2RecordCount:records.filter(r=>quarterNumber(r)===2).length,q3RecordCount:records.filter(r=>quarterNumber(r)===3).length,recordedCompanyCount:new Set(records.map(r=>r.company_id)).size,directQuarterRecordCount:records.filter(r=>r.period_type==='quarter_only_3months').length,cumulative3MonthRecordCount:records.filter(r=>r.period_type==='quarter_cumulative_3months').length,cumulative6MonthRecordCount:records.filter(r=>r.period_type==='quarter_cumulative_6months').length,cumulative9MonthRecordCount:records.filter(r=>r.period_type==='quarter_cumulative_9months').length,stockRecordCount:records.filter(r=>r.period_type==='point_in_time_stock').length};}
export function assertQuarterCurrentnessSupplement(rows){
 if(!Array.isArray(rows)||rows.length!==12||new Set(rows.map(r=>r.sourceCurrentnessCheckId)).size!==12)throw Error('補足の現在掲載版チェック件数が一致しません。');
 const keys='sourceCurrentnessCheckId companyId sourceUrl documentSha256 checkedAtUtc httpStatus byteComparisonStatus receivedBytes listingStatus correctionListStatus originalAcquisitionTimestampStatus automaticComparisonAllowed automaticAggregationAllowed checkedScope'.split(' ');
 for(const row of rows){const doc=QUARTER_CURRENTNESS_DOCUMENT_REGISTRY.find(d=>d.companyId===row.companyId&&d.sha256===row.documentSha256&&d.sourceUrl===row.sourceUrl);
  if(!doc||Object.keys(row).some(k=>!keys.includes(k))||!/^[a-f0-9]{64}$/.test(row.sourceCurrentnessCheckId)||!/^2026-10-14T.*(?:Z|\+00:00)$/.test(row.checkedAtUtc)||row.automaticComparisonAllowed!==false||row.automaticAggregationAllowed!==false||row.originalAcquisitionTimestampStatus!=='not_recorded'||row.companyId==='OBAYASHI'&&(row.httpStatus!==200||row.byteComparisonStatus!=='equal'||row.listingStatus!=='listed_in_checked_official_ir_page')||row.companyId==='KAJIMA'&&(row.httpStatus!==500||row.byteComparisonStatus!=='not_compared'||row.receivedBytes!==0||row.listingStatus!=='unknown_dynamic_feed_not_captured'||row.correctionListStatus!=='unconfirmed'))throw Error('補足チェックの公式出典・結果を確認できません。');
 }
 assertQuarterPublicStrings(rows);return rows;
}
export const QUARTER_METRIC_NAMES={depreciation_expense_reported:'減価償却費',eps_consolidated_reported:'1株当たり四半期純利益',equity_consolidated_reported:'自己資本',equity_ratio_consolidated_reported:'自己資本比率',net_assets_consolidated_reported:'純資産',net_assets_per_share_consolidated_reported:'1株当たり純資産',net_profit_parent_consolidated_reported:'親会社株主に帰属する四半期純利益',operating_profit_consolidated_reported:'営業利益',ordinary_profit_consolidated_reported:'経常利益',sales_consolidated_reported:'売上高',segment_external_customer_revenue_reported:'外部顧客への売上高',segment_fixed_asset_impairment_loss_construction_segment_reported:'建設事業の固定資産減損損失',segment_intersegment_internal_revenue_reported:'セグメント間内部売上高・振替高',segment_other_revenue_reported:'その他の収益',segment_reported_total_revenue_reported:'セグメントの報告売上合計',segment_revenue_from_customer_contracts_reported:'顧客との契約から生じる収益',segment_revenue_over_time_reported:'一定期間にわたり認識する収益',segment_revenue_point_in_time_reported:'一時点で認識する収益',segment_segment_profit_reported:'セグメント利益',total_assets_consolidated_reported:'総資産'};
Object.assign(QUARTER_METRIC_NAMES,{order_value_as_reported:'非建設事業の受注高（原表カテゴリ別）',profit_before_tax_consolidated_reported:'税引前利益（IFRS）',completed_construction_revenue_consolidated_reported:'完成工事高',construction_order_value_as_reported:'建設事業の受注高（原表カテゴリ別）',development_order_value_as_reported:'開発事業等の受注高',real_estate_order_value_as_reported:'不動産事業等の受注高',total_orders_as_reported:'受注の全体合計（不動産・開発等を含む）'});
Object.assign(QUARTER_METRIC_NAMES,{construction_gross_profit_consolidated_reported:'完成工事総利益（連結）',construction_gross_profit_standalone_reported:'完成工事総利益（個別）',construction_revenue_consolidated_reported:'完成工事高（連結）',construction_revenue_standalone_reported:'完成工事高（個別）',gross_profit_consolidated_reported:'売上総利益（連結）',gross_profit_standalone_reported:'売上総利益（個別）',net_profit_standalone_reported:'当期純利益（個別）',operating_profit_standalone_reported:'営業利益（個別）',ordinary_profit_standalone_reported:'経常利益（個別）',sales_standalone_reported:'売上高（個別）'});
export function quarterlySourceUrl(candidate){
 if(typeof candidate!=='string'||!candidate.startsWith('https://'))return null;
 try{const u=new URL(candidate);const approved=[...QUARTER_DOCUMENT_REGISTRY,...QUARTER_CURRENTNESS_DOCUMENT_REGISTRY,...QUARTER_PERIOD_COMPANION_REGISTRY].some(d=>d.sourceUrl===u.href)||u.href==='https://www.kitano.co.jp/wp-content/uploads/2025/11/IR20260210.pdf';return u.protocol==='https:'&&approved&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash?u.href:null;}catch{return null;}
}
const privateValue=/(?:\/Volumes\/|\/Users\/|file:\/\/|data\/raw\/|https?:\/\/(?:[^\s/]+\.)?(?:google\.com|googleapis\.com|github\.com)|(?:secret|password|credential|cookie|access[_-]?token)\s*[=:])/i;
export function assertQuarterPublicStrings(value){
 if(Array.isArray(value))return value.forEach(assertQuarterPublicStrings);
 if(value&&typeof value==='object')return Object.values(value).forEach(assertQuarterPublicStrings);
 if(typeof value==='string'){
  if(privateValue.test(value))throw Error('四半期データに公開対象外の参照があります。');
  for(const url of value.match(/https?:\/\/[^\s<>"')]+/g)||[])if(!quarterlySourceUrl(url))throw Error('四半期出典は登録した公式HTTPS財務PDFに限定しています。');
 }
}
function assertQuarterExpansionRecord(row){
 const doc=QUARTER_EXPANSION_DOCUMENTS.find(d=>d.extractorVersion===row.extractor_version&&d.sha256===row.source_file_sha256);
 const check=(value,keys,label)=>{if(Array.isArray(value))return value.forEach(v=>check(v,keys,label));if(value&&typeof value==='object')for(const [key,child] of Object.entries(value)){if(!keys.has(key))throw Error(`${label}に公開対象外の項目があります。`);check(child,keys,label);}};
 for(const key of Object.keys(row))if(!QUARTER_EXPANSION_RECORD_KEYS.has(key))throw Error('追加四半期データに公開対象外の項目があります。');
 check(row.source_locator,QUARTER_EXPANSION_LOCATOR_KEYS,'追加四半期の原文位置');
 check(row.source_selected_field_availability,QUARTER_EXPANSION_AVAILABILITY_KEYS,'追加四半期の選択表');
 check(row.source_value_annotation_guards,QUARTER_EXPANSION_ANNOTATION_KEYS,'追加四半期の注記');
 assertQuarterPublicStrings(row);
 if(!doc||row.company_id!==doc.companyId||row.reporting_entity_id!==doc.companyId||row.source_url!==doc.sourceUrl||row.document_version_sha256!==doc.sha256||row.document_id!==`pdf:${doc.sha256}`||row.source_document_type!==doc.sourceDocumentType||row.source_quarter_number!==doc.quarter||row.retrieved_at!==doc.acquiredAtUtc||row.as_of_check_utc!==doc.acquiredAtUtc||row.source_acquisition_date!==doc.acquiredAtUtc.slice(0,10))throw Error('追加四半期の原資料・実取得日を確認できません。');
 if(!/^[a-f0-9]{64}$/.test(row.fact_id)||!Number.isFinite(row.value)||row.actual_or_forecast!=='actual'||row.currency!=='JPY'||!['百万円','億円'].includes(row.unit)||!['standalone','consolidated'].includes(row.data_scope)||row.finance_eligible!==false||row.automatic_comparison_allowed!==false||row.automatic_aggregation_allowed!==false||QUARTER_PERMISSION_KEYS.some(k=>row.permissions?.[k]!==false))throw Error('追加四半期の値・単位・対象範囲・利用条件を確認できません。');
 if(row.source_url_byte_verification_status!=='http_200_saved_byte_equal'||row.source_acquisition_timestamp_status!=='known_actual_official_get_completion_utc'||row.current_official_version_match_status!=='unconfirmed_after_check'||!row.source_locator?.value_bbox_page_points_top_left||!row.source_locator?.period_binding_basis?.status||row.source_locator?.source_cell_id!==row.source_cell_id)throw Error('追加四半期の原表位置と版・期間根拠を確認できません。');
 const interim=row.company_id==='TAKENAKA',q=row.source_quarter_number,year=row.fiscal_year;
 if(interim?row.period_type!=='interim_cumulative_6months'||row.period_start!=='2025-01-01'||row.period_end!=='2025-06-30'||row.accounting_standard_id!==null||row.accounting_standard_status!=='not_disclosed_in_reviewed_source'||row.unit!=='億円':!['2024','2025'].includes(year)||![1,2,3].includes(q)||row.period_type!==`quarter_cumulative_${q*3}months`||row.period_start!==`${year}-04-01`||row.period_end!==`${year}-${{1:'06-30',2:'09-30',3:'12-31'}[q]}`)throw Error('追加四半期の累計・中間期間を確認できません。');
 if(row.company_id==='SMCC'&&q===3||row.company_id==='MAEDA'||row.company_id==='TAKENAKA'&&row.accounting_standard_as_disclosed!==null)throw Error('未収録会社・会計基準の状態を補完できません。');
}
export function assertQuarterRecord(row){
 if(row.extractor_version===STATEMENT_EXTRACTOR)return assertStatementPublicRecord(row);
 if(row.fact_id===QUARTER_HELD_FACT_ID){
  const doc=QUARTER_DOCUMENT_REGISTRY.find(d=>d.extractorVersion===row.extractor_version&&d.sha256===row.source_file_sha256);
  if(Object.keys(row).length!==QUARTER_HELD_RECORD_KEYS.size||Object.keys(row).some(k=>!QUARTER_HELD_RECORD_KEYS.has(k))||!doc||row.company_id!=='KITANO'||doc.companyId!=='KITANO'||row.reporting_entity_id!=='KITANO'||row.metric_id!=='depreciation_expense_reported'||row.record_kind!=='held_reference'||row.hold_reason_code!=='wrong_prior_column_interval'||row.value!==null||row.value_raw!==null||row.period_type!==null||row.period_start!==null||row.period_end!==null||row.source_locator!==null||row.source_quote!==null||row.source_url!==doc.sourceUrl||row.document_version_sha256!==doc.sha256||row.document_id!==`pdf:${doc.sha256}`||row.finance_eligible!==false||row.automatic_comparison_allowed!==false||row.automatic_aggregation_allowed!==false||QUARTER_PERMISSION_KEYS.some(k=>row.permissions?.[k]!==false))throw Error('保留中の四半期値を公開値へ復元できません。');
  assertQuarterPublicStrings(row);return;
 }
 if(QUARTER_EXPANSION_PROFILES.some(p=>p.extractorVersion===row.extractor_version))return assertQuarterExpansionRecord(row);
 const native=row.extractor_version===QUARTER_EXTRACTORS[6],shimizuToda=row.extractor_version===QUARTER_EXTRACTORS[7],recordKeys=shimizuToda?QUARTER_ST_RECORD_KEYS:native?QUARTER_IN_RECORD_KEYS:QUARTER_ZK_RECORD_KEYS,locatorKeys=shimizuToda?QUARTER_ST_LOCATOR_KEYS:native?QUARTER_IN_LOCATOR_KEYS:QUARTER_ZK_LOCATOR_KEYS;
 for(const key of Object.keys(row))if(!recordKeys.has(key))throw Error('四半期データに公開対象外の項目があります。');
 const locator=value=>{if(Array.isArray(value))return value.forEach(locator);if(value&&typeof value==='object')for(const [key,child]of Object.entries(value)){if(!locatorKeys.has(key))throw Error('原文位置に公開対象外の項目があります。');locator(child);}};
 locator(row.source_locator);locator(row.share_split_basis_source_locator);
 if(shimizuToda){const check=value=>{if(Array.isArray(value))return value.forEach(check);if(value&&typeof value==='object')for(const [key,child]of Object.entries(value)){if(!QUARTER_ST_RESTATEMENT_KEYS.has(key))throw Error('比較値の注記に公開対象外の項目があります。');check(child);}};check(row.source_restatement_basis);}else locator(row.source_restatement_basis);locator(row.source_order_dimensions);locator(row.consolidation_perimeter_annotation);
 if(row.same_byte_index_conflict&&Object.keys(row.same_byte_index_conflict).some(k=>!['indexed_title','source_url','treatment'].includes(k)))throw Error('資料索引の矛盾に公開対象外の項目があります。');
 if(row.period_companion){const check=value=>{if(Array.isArray(value))return value.forEach(check);if(value&&typeof value==='object')for(const [key,v]of Object.entries(value)){if(!(row.extractor_version===QUARTER_EXTRACTORS[5]?QUARTER_ZK_COMPANION_KEYS:QUARTER_PERIOD_COMPANION_KEYS).has(key))throw Error('期間根拠に公開対象外の項目があります。');check(v);}};check(row.period_companion);}
 assertQuarterPublicStrings(row);
 const doc=QUARTER_DOCUMENT_REGISTRY.find(d=>d.extractorVersion===row.extractor_version&&d.sha256===row.source_file_sha256);
 if(!doc||row.company_id!==doc.companyId||row.reporting_entity_id!==doc.companyId||row.source_family!==doc.sourceFamily||row.source_document_type!==(doc.sourceDocumentType||doc.sourceFamily)||row.actual_or_forecast!=='actual'||(row.currency!=='JPY'&&!(row.unit==='％'&&row.currency===null))||row.source_url!==doc.sourceUrl||row.document_version_sha256!==doc.sha256||row.document_id!=='pdf:'+doc.sha256||row.finance_eligible!==false||QUARTER_PERMISSION_KEYS.some(k=>row.permissions?.[k]!==false)||row.automatic_comparison_allowed===true||row.automatic_aggregation_allowed===true)throw Error('四半期出典・対象範囲・利用条件を確認できません。');
 if(!/^[a-f0-9]{64}$/.test(row.fact_id)||!Number.isFinite(row.value)||!['百万円','億円','円銭','％'].includes(row.unit)||!['quarter_cumulative_9months','quarter_cumulative_6months','quarter_cumulative_3months','quarter_only_3months','point_in_time_stock'].includes(row.period_type)||!['consolidated','segment','standalone','consolidated_construction_business'].includes(row.data_scope))throw Error('四半期値・単位・期間種別を確認できません。');
 if(row.period_type==='point_in_time_stock'){if(row.as_of_date!==null||row.period_start!==null||row.period_end!==null||!/^\d{4}-\d{2}$/.test(row.period_end_month))throw Error('残高の未収録日付を補完できません。');}
 else if(!/^\d{4}-\d{2}-\d{2}$/.test(row.period_start||'')||!/^\d{4}-\d{2}-\d{2}$/.test(row.period_end||''))throw Error('累計実期間を確認できません。');
 if(row.extractor_version===QUARTER_EXTRACTORS[4]){
  if(row.retrieved_at!==null||row.source_acquisition_date!==null||row.source_acquisition_timestamp_status!=='unknown_not_recorded'||row.as_of_check_utc_status!=='later_official_url_bytes_equal_saved_pdf'||!/^2026-10-14T/.test(row.as_of_check_utc||'')||row.prior_edition_difference_status!=='not_reviewed')throw Error('元取得日時・後日照合・訂正前との差の状態が一致しません。');
  if(row.company_id==='ASANUMA'){const companion=QUARTER_PERIOD_COMPANION_REGISTRY.find(d=>d.companyId===row.company_id&&d.quarter===row.source_quarter_number),basis=row.source_locator?.period_binding_basis,ref=basis?.source_locator;
   if(!companion||row.period_companion?.official_url!==companion.sourceUrl||row.period_companion.sha256!==companion.sha256||row.period_companion.purpose!=='exact_period_proof_only'||ref?.official_url!==companion.sourceUrl||ref.sha256!==companion.sha256||ref.pdf_page!==8||basis.status!=='official_companion_exact_calendar_interval'||basis.exact_dates_printed_on_selected_table!==false||row.source_quarter_number===1&&row.correction_status!=='official_listing_marks_2025_08_19_corrected_edition')throw Error('期間根拠資料・訂正版の対応を確認できません。');
  }
 }
 if(row.extractor_version===QUARTER_EXTRACTORS[5]){
  const fresh=row.company_id==='KUMAGAI'&&row.source_quarter_number!==2;
  if(fresh?row.source_acquisition_timestamp_status!=='known_from_official_capture'||row.retrieved_at!==row.as_of_check_utc||row.as_of_check_utc_status!=='official_url_body_captured':row.retrieved_at!==null||row.source_acquisition_date!==null||row.source_acquisition_timestamp_status!=='unknown_not_recorded'||row.as_of_check_utc_status!=='later_official_url_bytes_equal_saved_pdf')throw Error('元取得日時と後日の公式照合を区別できません。');
  if(row.company_id==='KUMAGAI'&&row.source_quarter_number===2){const doc=QUARTER_PERIOD_COMPANION_REGISTRY.find(d=>d.companyId==='KUMAGAI'),basis=row.source_locator?.period_binding_basis;
   if(row.unit!=='億円'||row.period_companion?.official_url!==doc.sourceUrl||row.period_companion.sha256!==doc.sha256||basis?.source_locator?.official_url!==doc.sourceUrl||basis.source_locator.sha256!==doc.sha256||basis.status!=='exact_official_companion_native')throw Error('熊谷組の表示単位・期間根拠を確認できません。');
  }else if(row.unit!=='百万円')throw Error('四半期原資料の単位が一致しません。');
  if(row.company_id==='ZENITAKA'&&row.data_scope==='standalone'&&(row.source_locator?.period_binding_basis?.source_locator?.pdf_page!==7||row.source_locator.period_binding_basis.source_locator.printed_page!==5||row.metadata_correction_status!=='reviewed_period_locator_printed_page'))throw Error('連結の期間出典と単体受注の値の位置を区別できません。');
  if(row.correction_ids&&(!Array.isArray(row.correction_ids)||row.correction_ids.some(id=>!/^[a-f0-9]{64}$/.test(id))||row.metadata_correction_status!==(row.company_id==='ZENITAKA'?'reviewed_period_locator_printed_page':'reviewed_literal_source_fragments')))throw Error('原文と説明区分の訂正記録を確認できません。');
 }
 if(native)assertQuarterNativeIssuerRecord(row,doc);
 if(shimizuToda)assertQuarterShimizuTodaRecord(row,doc);
 if(QUARTER_EXTRACTORS.slice(2,6).includes(row.extractor_version)){
  if(![1,2,3].includes(row.source_quarter_number)||!['cumulative','standalone_reported_quarter'].includes(row.source_period_semantics)||row.period_type==='quarter_only_3months'&&row.candidate_disposition!=='normalize_direct_reported_single_quarter_value')throw Error('単独四半期と累計の区別を確認できません。');
  const basis=row.source_locator?.period_binding_basis;
  if(!basis?.status||row.company_id==='KAJIMA'&&(basis.status!=='normalized_from_source_period_labels_and_verified_fiscal_bounds_not_direct_date_text'||basis.exact_dates_printed_on_selected_table!==false))throw Error('期間の正規化根拠を確認できません。');
 }
}
function assertQuarterNativeIssuerRecord(row,doc){
 const q=row.source_quarter_number,ifrs=row.company_id==='INFR',basis=row.source_locator?.period_binding_basis,availability=row.source_selected_field_availability;
 const selectedFinance=['sales_consolidated_reported','operating_profit_consolidated_reported',ifrs?'profit_before_tax_consolidated_reported':'ordinary_profit_consolidated_reported','net_profit_parent_consolidated_reported'];
 const order=row.metric_id==='construction_order_value_as_reported';
 if(![1,2,3].includes(q)||doc.quarter!==q||row.unit!=='百万円'||row.accounting_standard_id!==(ifrs?'IFRS':'JGAAP')||row.accounting_standard_as_disclosed!==(ifrs?'ＩＦＲＳ':'日本基準')||!selectedFinance.includes(row.metric_id)&&!(order&&!ifrs)||!['consolidated',...(order?['standalone']:[])].includes(row.data_scope)||row.source_dataset_id!==(ifrs?'infr':'nishimatsu')+'_official_quarterly_results_2026')throw Error('新四半期の会計区分・原表指標・対象範囲を確認できません。');
 if(!['2024','2025'].includes(row.fiscal_year)||row.period_start!==row.fiscal_year+'-04-01'||row.period_end!==row.fiscal_year+'-'+({1:'06-30',2:'09-30',3:'12-31'}[q])||row.period_type!=='quarter_cumulative_'+q*3+'months'||basis?.source_sha256!==doc.sha256||basis.source_url!==undefined&&basis.source_url!==doc.sourceUrl||basis.status!==(ifrs?'direct_same_consolidated_statement':order?'direct_exact_from_native_order_table':'same_document_consolidated_statement_period_support')||!basis.period_start_quote||!basis.period_end_quote)throw Error('新四半期の同じPDF内の累計期間根拠を確認できません。');
 if(row.source_url_byte_verification_status!=='http_200_saved_byte_equal'||row.source_acquisition_timestamp_status!=='known_actual_official_get_completion_utc'||row.retrieved_at!==doc.acquiredAtUtc||row.as_of_check_utc!==doc.acquiredAtUtc||row.source_acquisition_date!==doc.acquiredAtUtc.slice(0,10)||row.current_official_version_match_status!=='unconfirmed_after_check')throw Error('新四半期の実取得UTC・公式出典の確認範囲を確認できません。');
 const check=value=>{if(Array.isArray(value))throw Error('選択表の会計項目状態を確認できません。');if(value&&typeof value==='object')for(const [key,child]of Object.entries(value)){if(!QUARTER_FIELD_AVAILABILITY_KEYS.has(key))throw Error('選択表の会計項目状態に公開対象外の項目があります。');check(child);}};check(availability);
 const ordinary=availability?.ordinary_profit_consolidated_reported;
 if(!ordinary||Object.keys(availability).length!==1||ordinary.company_wide_non_disclosure_claim!==false||ordinary.scope!=='selected_consolidated_financial_table_only'||ordinary.source_file_sha256!==doc.sha256||ordinary.statement_accounting_label_as_disclosed!==row.accounting_standard_as_disclosed||ordinary.status!==(ifrs?'not_applicable_in_selected_ifrs_table':'reported_in_selected_jgaap_table')||ordinary.physical_page!==(ifrs?9:1))throw Error('選択表の経常利益の適用状態を会社全体の非開示と同一視できません。');
 const aliases=row.source_locator?.corroborating_alias_locators;
 if(!Array.isArray(aliases)||aliases.length>1||aliases.length&&(!order||row.data_scope!=='standalone'||aliases[0].alias_type!=='native_individual_total_repeat_not_separate_fact'||!aliases[0].alias_cell_id||!aliases[0].guard_bboxes?.some(g=>String(g.quote).replaceAll(',','')===row.value_raw.replaceAll(',',''))))throw Error('受注合計の重複欄は別の値として追加できません。');
 for(const key of ['source_family','period_kind','period_end_month','as_of_date','candidate_disposition','source_period_semantics','as_of_check_utc_status','retrieved_at_basis'])if(Object.hasOwn(row,key))throw Error('新四半期の原記録にない項目を補完できません。');
}
function assertQuarterShimizuTodaRecord(row,doc){
 const q=row.source_quarter_number,shimizu=row.company_id==='SHIMIZU',finance=['sales_consolidated_reported','operating_profit_consolidated_reported','ordinary_profit_consolidated_reported','net_profit_parent_consolidated_reported'].includes(row.metric_id),overseas=shimizu&&!finance&&row.data_scope==='consolidated',basis=row.source_locator?.period_binding_basis;
 if([...QUARTER_ST_RECORD_KEYS].some(k=>!Object.hasOwn(row,k))||!['SHIMIZU','TODA'].includes(row.company_id)||![1,2,3].includes(q)||doc.quarter!==q||row.accounting_standard_id!=='JGAAP'||row.accounting_standard_as_disclosed!=='日本基準'||row.unit!=='百万円'||row.subject_entity_id!==row.company_id||row.subject_entity_binding_status!=='issuer_exact_from_native'||row.source_dataset_id!==(shimizu?'shimizu':'toda')+'_official_quarterly_results_2026'||row.source_subject_scope_as_disclosed!==(row.data_scope==='consolidated'?'連結':'個別')||typeof row.source_subject_scope_interpretation!=='string'||!row.source_subject_scope_interpretation||row.source_text!==row.value_raw||row.source_quote_kind!=='joined_selected_native_fragments')throw Error('清水・戸田の会計区分・主体・原文の対象範囲を確認できません。');
 if(finance?row.data_scope!=='consolidated':!['total_orders_as_reported',...(!shimizu?['construction_order_value_as_reported','order_value_as_reported']:[])].includes(row.metric_id)||shimizu&&q===1||!overseas&&row.data_scope!=='standalone')throw Error('清水・戸田の財務と受注の対象範囲を確認できません。');
 const periodStatus=finance?'direct_exact_from_same_consolidated_statement':overseas?'same_page_repeated_order_period_header_exact_dates':'direct_exact_from_same_order_table',basisStatus=finance?'direct_same_consolidated_statement':overseas?'same_page_repeated_order_header_dates':'direct_same_order_table',periodPage=finance?(shimizu?7:{1:8,2:10,3:9}[q]):shimizu?{2:19,3:20}[q]:{1:17,2:21,3:18}[q];
 if(!['2024','2025'].includes(row.fiscal_year)||row.period_start!==row.fiscal_year+'-04-01'||row.period_end!==row.fiscal_year+'-'+{1:'06-30',2:'09-30',3:'12-31'}[q]||row.period_type!=='quarter_cumulative_'+q*3+'months'||row.period_interval_status!==periodStatus||basis?.status!==basisStatus||basis.source_sha256!==doc.sha256||basis.physical_page!==periodPage||!basis.period_start_quote||!basis.period_end_quote||!Array.isArray(row.source_locator.native_header_guards)||!row.source_locator.native_header_guards.some(g=>String(g.quote).replaceAll(',','')===row.value_raw.replaceAll(',',''))||!Array.isArray(row.source_locator.corroborating_alias_locators)||row.source_locator.corroborating_alias_locators.length)throw Error('清水・戸田の同じPDF内の累計期間根拠と原値を確認できません。');
 if(row.source_url_byte_verification_status!=='http_200_saved_byte_equal'||row.source_acquisition_timestamp_status!=='known_actual_official_get_completion_utc'||row.retrieved_at!==doc.acquiredAtUtc||row.as_of_check_utc!==doc.acquiredAtUtc||row.source_acquisition_date!==doc.acquiredAtUtc.slice(0,10)||row.current_official_version_match_status!=='unconfirmed_after_check'||row.correction_status!=='unreviewed_full_revision_series')throw Error('清水・戸田の実取得UTCと版確認の範囲を確認できません。');
 const availability=row.source_selected_field_availability,ordinary=availability?.ordinary_profit_consolidated_reported;
 const check=value=>{if(Array.isArray(value))throw Error('選択表の会計項目状態を確認できません。');if(value&&typeof value==='object')for(const [key,child]of Object.entries(value)){if(!QUARTER_ST_FIELD_AVAILABILITY_KEYS.has(key))throw Error('選択表の会計項目状態に公開対象外の項目があります。');check(child);}};check(availability);
 if(!ordinary||Object.keys(availability).length!==1||ordinary.company_wide_non_disclosure_claim!==false||ordinary.scope!=='selected_consolidated_financial_table_only'||ordinary.source_file_sha256!==doc.sha256||ordinary.status!=='reported_in_selected_jgaap_table')throw Error('清水・戸田の選択表の状態を会社全体の非開示と同一視できません。');
 if(overseas&&(row.metric_id!=='total_orders_as_reported'||row.source_category_as_disclosed!=='合 計'||row.source_parent_category_as_disclosed!=='（参考）海外受注高の状況（連結）'||!row.source_subject_scope_interpretation.includes('not consolidated companywide total')))throw Error('清水の海外受注参考値を会社全体の受注合計として扱えません。');
 if(!shimizu&&!finance){
  if(!Array.isArray(row.source_row_path_as_disclosed)||!row.source_row_path_as_disclosed.length||row.source_row_path_as_disclosed.at(-1)!==row.source_row_label_as_disclosed||row.metric_id==='construction_order_value_as_reported'&&row.source_row_path_as_disclosed[0]!=='建設事業'||row.metric_id==='order_value_as_reported'&&!['国内投資開発事業等','環境・エネルギー事業'].includes(row.source_row_path_as_disclosed[0])||row.metric_id==='total_orders_as_reported'&&(row.source_row_path_as_disclosed.length!==1||row.source_category_as_disclosed!=='合 計'))throw Error('戸田の受注の全体合計・建設小計・非建設事業の区分を確認できません。');
 }
 const restatement=row.source_restatement_basis,restated=shimizu&&finance&&q===3&&row.fiscal_year==='2024';
 if(restated?!restatement||restatement.source_sha256!==doc.sha256||restatement.physical_page!==1||!Array.isArray(restatement.native_quote_lines)||restatement.native_quote_lines.length!==2||!restatement.native_quote_lines.every(line=>typeof line.quote==='string'&&Array.isArray(line.bbox_pt)&&line.bbox_pt.length===4):restatement!==null)throw Error('清水Q3の前年財務注記を他の期間や受注へ転記できません。');
}
export async function validateQuarterlyAsset(asset,catalog){
 const p=asset?.payload;
 if(asset?.schemaVersion!==1||p?.schemaVersion!==1||p.datasetId!=='buildbase-quarterly-financial-public'||p.origin?.generatedFrom!=='Source normalized quarterly financial facts; explicit public projection'||asset.projectionHash!==await canonicalSha256(p)||catalog&&catalog.projectionHash!==asset.projectionHash)throw Error('四半期公開データ版を確認できません。');
 if(p.records?.length!==QUARTER_RECORD_COUNT||new Set(p.records.map(r=>r.fact_id)).size!==QUARTER_RECORD_COUNT||p.companies?.length!==21||new Set(p.companies.map(c=>c.companyId)).size!==21||QUARTER_PERMISSION_KEYS.some(k=>p.permissions?.[k]!==false))throw Error('四半期収録件数・利用条件を確認できません。');
 if(catalog&&(catalog.numericRecordCount!==QUARTER_RECORD_COUNT-1||catalog.heldReferenceCount!==1))throw Error('数値と保留参照の件数を確認できません。');
 if(catalog?.currentnessSupplement){assertQuarterCurrentnessSupplement(catalog.currentnessSupplement);if(catalog.currentnessSupplementHash!==await canonicalSha256(catalog.currentnessSupplement))throw Error('補足チェック版を確認できません。');}
 for(const row of p.records)assertQuarterRecord(row);
 if(p.records.filter(r=>r.record_kind==='held_reference').length!==1||!p.records.some(r=>r.fact_id===QUARTER_HELD_FACT_ID&&r.record_kind==='held_reference'))throw Error('保留中の既存四半期IDを確認できません。');
 if(p.records.filter(r=>r.extractor_version===QUARTER_EXTRACTORS[6]).reduce((n,r)=>n+r.source_locator.corroborating_alias_locators.length,0)!==6)throw Error('西松建設の重複合計欄の照合位置件数が一致しません。');
 const added=p.records.filter(r=>r.extractor_version===QUARTER_EXTRACTORS[7]);
 if(added.filter(r=>r.company_id==='SHIMIZU'&&r.metric_id==='total_orders_as_reported'&&r.data_scope==='consolidated').length!==4||added.filter(r=>r.source_restatement_basis).length!==4||added.filter(r=>r.metric_id==='order_value_as_reported').length!==12)throw Error('清水・戸田の参考値・比較注記・非建設受注の件数が一致しません。');
 for(const doc of QUARTER_DOCUMENT_REGISTRY)if(p.records.filter(r=>r.extractor_version===doc.extractorVersion&&r.source_file_sha256===doc.sha256).length!==doc.count)throw Error('各原資料の収録範囲を確認できません。');
 for(const c of p.companies){const companyRecords=p.records.filter(r=>r.company_id===c.companyId);const counts=[1,2,3].map(q=>companyRecords.filter(r=>quarterNumber(r)===q).length);counts.push(companyRecords.filter(r=>r.period_type==='quarter_only_3months').length);if(Object.keys(c).some(k=>!['companyId','companyName','q1RecordCount','q2RecordCount','q3RecordCount','q4DirectRecordCount','standaloneQuarterRecordCount','status','nonDisclosureAssertion','checkedScope'].includes(k))||c.nonDisclosureAssertion!==false||c.status!==(counts.some(Boolean)?'partial_records_available':'not_reviewed')||[c.q1RecordCount,c.q2RecordCount,c.q3RecordCount,c.standaloneQuarterRecordCount].some((n,i)=>n!==counts[i])||c.q4DirectRecordCount!==0)throw Error('会社別の確認範囲を確認できません。');}
 assertQuarterPublicStrings(p);return p;
}
export function quarterMetricName(row){if(row.extractor_version===QUARTER_EXTRACTORS[7]&&row.metric_id==='total_orders_as_reported')return row.company_id==='SHIMIZU'&&row.data_scope==='consolidated'?'海外受注高（連結・参考値）':'受注の全体合計（原資料の対象範囲）';return QUARTER_EXTRACTORS.slice(4).includes(row.extractor_version)&&row.metric_id==='total_orders_as_reported'?'受注高（原資料の合計）':QUARTER_METRIC_NAMES[row.metric_id]||row.metric_id;}
export function quarterMeasureKind(row){return row.unit==='円銭'?'1株当たり':row.unit==='％'?'比率':row.period_type==='point_in_time_stock'?'残高':'金額';}
export function quarterPeriodLabel(row){return row.record_kind==='held_reference'?'期間非公開（前年欄の対応誤りで保留）':row.period_type==='point_in_time_stock'?`${row.period_end_month}（原資料は月表記・正確な日付未収録）`:`${row.period_start} ～ ${row.period_end}（${row.period_type==='interim_cumulative_6months'?'中間6か月累計':row.period_type==='quarter_only_3months'?'原資料の単独3か月':(row.period_type.match(/cumulative_(\d+)months/)?.[1]||'期間未判定')+'か月累計'}）`;}
export function quarterlyFilters(state){return {companyId:state.quarterCompany||'',metricId:state.quarterMetric||'',periodType:state.quarterPeriod||'',scope:state.quarterScope||'',query:state.quarterQuery||''};}
export function filterQuarterlyRecords(payload,f={}){const terms=String(f.query||'').normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean);return payload.records.filter(r=>(!f.companyId||r.company_id===f.companyId)&&(!f.metricId||r.metric_id===f.metricId)&&(!f.periodType||r.period_type===f.periodType)&&(!f.scope||r.data_scope===f.scope)&&terms.every(t=>JSON.stringify([r,quarterMetricName(r),payload.companies?.find(c=>c.companyId===r.company_id)?.companyName||r.company_id,QUARTER_COMPANY_SEARCH_ALIASES[r.company_id]||[],quarterMeasureKind(r),quarterPeriodLabel(r)]).normalize('NFKC').toLowerCase().includes(t)));}
export function quarterlyExport(asset,filters={}){return {schemaVersion:1,exportScope:'selected_quarterly_source_records',origin:asset.payload.origin,projectionHash:asset.projectionHash,conditions:filters,permissions:asset.payload.permissions,companies:asset.payload.companies,records:filterQuarterlyRecords(asset.payload,filters)};}
export function quarterlyCsv(asset,filters={}){
 const out=quarterlyExport(asset,filters),headers=['public_projection_hash','source_subset_hash','fact_id','company_id','company_period_id','fiscal_year_as_stored','official_fiscal_year_label','metric_id','metric_name','value','value_raw','unit','currency','measure_kind','period_type','period_kind','period_start','period_end','period_end_month','as_of_date','as_of_status','data_scope','source_segment_label','source_reporting_scope','actual_or_forecast','recorded_status','finance_eligible','source_url','document_id','source_file_sha256','document_version_sha256','source_locator','source_quote','corroborating_source_quote','source_period_quote','source_edition_date_as_disclosed','retrieved_at','retrieved_at_basis','source_acquisition_date','source_acquisition_timestamp_status','as_of_check_utc','as_of_check_utc_status','whole_document_review_status','candidate_disposition','share_split_comparative_basis','share_split_source_note','source_row_role','is_additive_leaf','is_reported_total','is_reported_subtotal','is_reconciliation_adjustment','source_quarter_number','source_period_semantics','source_category_as_disclosed','source_order_dimensions','source_row_hierarchy','source_notes','source_restatement_basis','semantic_overlap_group','semantic_overlap_status','display_precision_as_disclosed','permissions','correction_status','prior_edition_difference_status','period_companion','semantic_category_label','correction_ids','metadata_correction_status','accounting_standard_id','accounting_standard_as_disclosed','source_row_label_as_disclosed','source_parent_category_as_disclosed','source_selected_field_availability','source_url_byte_verification_status','source_subject_scope_as_disclosed','source_subject_scope_interpretation','source_row_path_as_disclosed','source_precision_status','period_interval_status','complete_public_source_record'];
 const rows=out.records.filter(r=>r.record_kind!=='held_reference').map(r=>[out.projectionHash,out.origin.sourceSubsetHash,r.fact_id,r.company_id,r.target_company_period_id,r.fiscal_year,r.official_fiscal_year_label,r.metric_id,quarterMetricName(r),r.value,r.value_raw,r.unit,r.currency,quarterMeasureKind(r),r.period_type,r.period_kind,r.period_start,r.period_end,r.period_end_month,r.as_of_date,r.as_of_status,r.data_scope,r.source_segment_label,r.source_reporting_scope,r.actual_or_forecast,r.status,r.finance_eligible,r.source_url,r.document_id,r.source_file_sha256,r.document_version_sha256,JSON.stringify(r.source_locator),r.source_quote,r.corroborating_source_quote,r.source_period_quote,r.source_edition_date_as_disclosed,r.retrieved_at,r.retrieved_at_basis,r.source_acquisition_date,r.source_acquisition_timestamp_status,r.as_of_check_utc,r.as_of_check_utc_status,r.whole_document_review_status,r.candidate_disposition,JSON.stringify(r.share_split_comparative_basis),r.share_split_source_note,r.source_row_role,r.is_additive_leaf,r.is_reported_total,r.is_reported_subtotal,r.is_reconciliation_adjustment,r.source_quarter_number,r.source_period_semantics,r.source_category_as_disclosed,JSON.stringify(r.source_order_dimensions),r.source_row_hierarchy,JSON.stringify(r.source_notes),JSON.stringify(r.source_restatement_basis),r.semantic_overlap_group,r.semantic_overlap_status,r.display_precision_as_disclosed,JSON.stringify(r.permissions),r.correction_status,r.prior_edition_difference_status,JSON.stringify(r.period_companion),r.semantic_category_label,JSON.stringify(r.correction_ids),r.metadata_correction_status,r.accounting_standard_id,r.accounting_standard_as_disclosed,r.source_row_label_as_disclosed,r.source_parent_category_as_disclosed,JSON.stringify(r.source_selected_field_availability),r.source_url_byte_verification_status,r.source_subject_scope_as_disclosed,r.source_subject_scope_interpretation,JSON.stringify(r.source_row_path_as_disclosed),r.source_precision_status,r.period_interval_status,JSON.stringify(r)]);
 return '\uFEFF'+serializeCsv([headers,...rows]);
}
export function quarterlyCoverageCsv(companies){return '\uFEFF'+serializeCsv([['company_id','company_name','q1_source_record_count_current_and_prior','q2_source_record_count_current_and_prior','q3_source_record_count_current_and_prior','q4_direct_record_count','standalone_quarter_record_count','review_status','non_disclosure_assertion','checked_scope'],...companies.map(c=>[c.companyId,c.companyName,c.q1RecordCount,c.q2RecordCount,c.q3RecordCount,c.q4DirectRecordCount,c.standaloneQuarterRecordCount,c.status,c.nonDisclosureAssertion,c.checkedScope])]);}
