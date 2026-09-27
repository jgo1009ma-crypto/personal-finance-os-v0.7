-- Snapshot of uploaded statements used as the initial reconciliation baseline.
-- Apply after seed_user.sql. Values are intentionally tagged when source data is inconsistent.
DO $$
DECLARE
  uid uuid;
  a_classic uuid; a_joy uuid; a_bbva uuid; a_nu uuid; a_liverpool uuid;
  s_classic uuid; s_joy uuid; s_bbva uuid; s_nu uuid; s_liverpool uuid;
BEGIN
  select id into uid from users where display_name='Alex' limit 1;
  if uid is null then raise exception 'Run seed_user.sql first'; end if;
  select id into a_classic from accounts where user_id=uid and name='Banamex Clásica';
  select id into a_joy from accounts where user_id=uid and name='Banamex Joy';
  select id into a_bbva from accounts where user_id=uid and name='BBVA Azul';
  select id into a_nu from accounts where user_id=uid and name='Nu Oro';
  select id into a_liverpool from accounts where user_id=uid and name='Liverpool';

  insert into statements(account_id,period_start,period_end,closing_date,due_date,statement_balance,total_debt_balance,payment_to_avoid_interest,minimum_payment,official_interest,official_fees,reconciled,source_document_id,data_quality,metadata)
  values(a_classic,'2026-08-14','2026-09-11','2026-09-11','2026-10-05',14224.36,17163.57,14224.36,400,0,67.99,true,'banamex-classic-2026-09','official','{"future_installment_balance":2939.21}')
  on conflict(account_id,closing_date) do update set total_debt_balance=excluded.total_debt_balance
  returning id into s_classic;
  if s_classic is null then select id into s_classic from statements where account_id=a_classic and closing_date='2026-09-11'; end if;

  insert into statements(account_id,period_start,period_end,closing_date,due_date,statement_balance,total_debt_balance,payment_to_avoid_interest,minimum_payment,official_interest,official_fees,reconciled,source_document_id,data_quality,metadata)
  values(a_joy,'2026-08-18','2026-09-17','2026-09-17','2026-10-07',4244.60,37068.04,4244.60,750,0,0,true,'banamex-joy-2026-09','inconsistent','{"future_installment_balance_official":32823.44,"identified_future_plans":24323.44,"unallocated_gap":8500.00}')
  on conflict(account_id,closing_date) do update set total_debt_balance=excluded.total_debt_balance,data_quality=excluded.data_quality,metadata=excluded.metadata
  returning id into s_joy;
  if s_joy is null then select id into s_joy from statements where account_id=a_joy and closing_date='2026-09-17'; end if;

  insert into statements(account_id,period_start,period_end,closing_date,due_date,statement_balance,total_debt_balance,payment_to_avoid_interest,minimum_payment,official_interest,official_fees,reconciled,source_document_id,data_quality,metadata)
  values(a_bbva,'2026-08-13','2026-09-12','2026-09-12','2026-10-02',7363.12,47937.27,7363.12,1132.50,452.94,0,true,'bbva-blue-2026-09','official','{"future_installment_balance":40574.15,"interest_plan_balance":13100.15}')
  on conflict(account_id,closing_date) do update set total_debt_balance=excluded.total_debt_balance
  returning id into s_bbva;
  if s_bbva is null then select id into s_bbva from statements where account_id=a_bbva and closing_date='2026-09-12'; end if;

  -- Nu prints an internally inconsistent total-debt field. Preserve the derived value and tag it.
  insert into statements(account_id,period_start,period_end,closing_date,due_date,statement_balance,total_debt_balance,payment_to_avoid_interest,minimum_payment,official_interest,official_fees,reconciled,source_document_id,data_quality,metadata)
  values(a_nu,'2026-08-06','2026-09-05','2026-09-05','2026-09-17',5342.45,11479.41,5342.45,323.70,138.59,0,true,'nu-2026-09','inconsistent','{"future_installment_balance":6136.96,"printed_total_debt":0,"derived_total_debt":11479.41}')
  on conflict(account_id,closing_date) do update set total_debt_balance=excluded.total_debt_balance,data_quality=excluded.data_quality,metadata=excluded.metadata
  returning id into s_nu;
  if s_nu is null then select id into s_nu from statements where account_id=a_nu and closing_date='2026-09-05'; end if;

  insert into statements(account_id,period_start,period_end,closing_date,due_date,statement_balance,total_debt_balance,payment_to_avoid_interest,minimum_payment,official_interest,official_fees,reconciled,source_document_id,data_quality,metadata)
  values(a_liverpool,'2026-07-28','2026-08-27','2026-08-27','2026-09-27',19285.22,19285.22,3646.16,364.63,0,0,true,'liverpool-2026-08','official','{"all_balance_in_installment_plans":true}')
  on conflict(account_id,closing_date) do update set total_debt_balance=excluded.total_debt_balance
  returning id into s_liverpool;
  if s_liverpool is null then select id into s_liverpool from statements where account_id=a_liverpool and closing_date='2026-08-27'; end if;

  insert into balance_snapshots(account_id,snapshot_date,balance,available_credit,source,statement_id)
  values
    (a_classic,'2026-09-11',17163.57,0,'statement',s_classic),
    (a_joy,'2026-09-17',37068.04,22432,'statement',s_joy),
    (a_bbva,'2026-09-12',47937.27,42662.73,'statement',s_bbva),
    (a_liverpool,'2026-08-27',19285.22,25714.78,'statement',s_liverpool)
  on conflict(account_id,snapshot_date,source) do nothing;
END $$;
