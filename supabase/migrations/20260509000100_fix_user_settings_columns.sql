alter table public.user_settings
  add column if not exists default_demo boolean not null default true,
  add column if not exists daily_loss_limit numeric not null default 50,
  add column if not exists max_stake numeric not null default 25,
  add column if not exists max_consecutive_losses int not null default 5,
  add column if not exists default_stake numeric default 1,
  add column if not exists default_duration text default '5t',
  add column if not exists preferred_symbol text default 'R_100',
  add column if not exists theme text default 'dark';
