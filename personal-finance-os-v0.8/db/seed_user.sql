-- Seed data for the current Personal Finance OS prototype.
-- Safe to edit before applying. Stores last4 only; never full PAN/CVV.
DO $$
DECLARE
  uid uuid;
  acc_classic uuid; acc_joy uuid; acc_bbva uuid; acc_nu uuid; acc_liverpool uuid; acc_mp uuid;
BEGIN
  select id into uid from users where display_name='Alex' limit 1;
  if uid is null then
    insert into users(display_name,currency,timezone) values('Alex','MXN','America/Mexico_City') returning id into uid;
  end if;

  insert into user_preferences(user_id,variable_spend_target,emergency_fund_months,max_msi_income_ratio,max_credit_utilization)
  values(uid,6000,3,0.15,0.30)
  on conflict(user_id) do nothing;

  insert into accounts(user_id,name,account_type,institution,currency,last4,display_order)
  values(uid,'Banamex Clásica','credit_card','Banamex','MXN','3884',1)
  on conflict do nothing;
  select id into acc_classic from accounts where user_id=uid and name='Banamex Clásica' limit 1;

  insert into accounts(user_id,name,account_type,institution,currency,last4,display_order)
  values(uid,'Banamex Joy','credit_card','Banamex','MXN','5137',2)
  on conflict do nothing;
  select id into acc_joy from accounts where user_id=uid and name='Banamex Joy' limit 1;

  insert into accounts(user_id,name,account_type,institution,currency,last4,display_order)
  values(uid,'BBVA Azul','credit_card','BBVA','MXN','8989',3)
  on conflict do nothing;
  select id into acc_bbva from accounts where user_id=uid and name='BBVA Azul' limit 1;

  insert into accounts(user_id,name,account_type,institution,currency,last4,display_order)
  values(uid,'Nu Oro','credit_card','Nu','MXN','1742',4)
  on conflict do nothing;
  select id into acc_nu from accounts where user_id=uid and name='Nu Oro' limit 1;

  insert into accounts(user_id,name,account_type,institution,currency,display_order)
  values(uid,'Liverpool','credit_card','Liverpool','MXN',5)
  on conflict do nothing;
  select id into acc_liverpool from accounts where user_id=uid and name='Liverpool' limit 1;

  insert into accounts(user_id,name,account_type,institution,currency,display_order)
  values(uid,'Mercado Pago','wallet','Mercado Pago','MXN',10)
  on conflict do nothing;
  select id into acc_mp from accounts where user_id=uid and name='Mercado Pago' limit 1;

  insert into credit_cards(account_id,credit_limit,statement_close_day,due_rule_type,due_rule_value,preferred_pay_day,default_apr,interest_day_basis,interest_tax_rate)
  values
    (acc_classic,16500,11,'days_after_close',24,30,0.6201,360,0.16),
    (acc_joy,59500,17,'days_after_close',20,30,0.6301,360,0.16),
    (acc_bbva,90600,12,'days_after_close',20,30,0.5081,360,0.16),
    (acc_nu,25000,5,'days_after_close',12,9,1.3990,360,0.16),
    (acc_liverpool,45000,27,'fixed_day',27,null,0.5886,360,0.16)
  on conflict(account_id) do nothing;

  insert into card_rule_versions(account_id,valid_from,statement_close_day,due_rule_type,due_rule_value,preferred_pay_day,default_apr,interest_day_basis,interest_tax_rate,source)
  values
    (acc_classic,'2026-09-01',11,'days_after_close',24,30,0.6201,360,0.16,'statement'),
    (acc_joy,'2026-09-01',17,'days_after_close',20,30,0.6301,360,0.16,'statement'),
    (acc_bbva,'2026-09-01',12,'days_after_close',20,30,0.5081,360,0.16,'statement'),
    (acc_nu,'2026-09-01',5,'days_after_close',12,9,1.3990,360,0.16,'statement'),
    (acc_liverpool,'2026-08-01',27,'fixed_day',27,null,0.5886,360,0.16,'statement')
  on conflict(account_id,valid_from) do nothing;

  -- Net salary is modeled as two actual cash inflows, not as a monthly average.
  insert into income_rules(user_id,name,amount,frequency,day_1,day_2,start_date)
  select uid,'Nómina',17000,'semimonthly',9,24,'2026-10-01'
  where not exists(select 1 from income_rules where user_id=uid and name='Nómina');

  -- First October extraordinary company payment. The December bonus remains a pending-date assumption.
  insert into income_rules(user_id,name,amount,frequency,start_date,end_date)
  select uid,'Pago extraordinario empresa Oct-2026',12000,'one_time','2026-10-09','2026-10-09'
  where not exists(select 1 from income_rules where user_id=uid and name='Pago extraordinario empresa Oct-2026');

  -- Recurring expenses. UVM family support is modeled as offset income, preserving the gross tuition amount.
  insert into recurring_rules(user_id,name,amount,frequency,interval_value,start_date,offset_income)
  select uid,v.name,v.amount,v.frequency,v.interval_value,v.start_date,v.offset_income
  from (values
    ('Mantenimiento',900::numeric,'monthly'::text,null::int,'2026-10-01'::date,0::numeric),
    ('Gas',100,'monthly',null,'2026-10-01',0),
    ('Luz',350,'bimonthly',null,'2026-10-01',0),
    ('Agua',150,'bimonthly',null,'2026-10-01',0),
    ('Maestría UVM',5116,'monthly',null,'2026-10-01',3000),
    ('Podóloga',380,'monthly',null,'2026-10-01',0),
    ('Telcel',500,'monthly',null,'2026-10-01',0),
    ('HBO Max',179,'monthly',null,'2026-10-01',0),
    ('Netflix',269,'monthly',null,'2026-10-01',0),
    ('Meli+',99,'monthly',null,'2026-10-01',0),
    ('ChatGPT Plus',798,'monthly',null,'2026-10-01',0),
    ('Google',198,'monthly',null,'2026-10-01',0),
    ('Croquetas gatos',600,'monthly',null,'2026-10-01',0),
    ('Arena gatos',870,'every_n_days',45,'2026-10-01',0),
    ('F1 TV',129,'monthly',null,'2026-10-01',0),
    ('iCloud',50,'monthly',null,'2026-10-01',0),
    ('Game Pass',349,'monthly',null,'2026-10-01',0),
    ('Totalplay',800,'monthly',null,'2026-10-01',0),
    ('Apple Music',139,'monthly',null,'2026-10-01',0),
    ('Renta',5600,'monthly',null,'2026-11-01',0)
  ) as v(name,amount,frequency,interval_value,start_date,offset_income)
  where not exists(select 1 from recurring_rules r where r.user_id=uid and r.name=v.name);
END $$;
