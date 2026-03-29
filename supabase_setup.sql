-- ════════════════════════════════════════════════
--  QBOB — SQL для Supabase
--  Запусти в: Supabase Dashboard → SQL Editor → Run
-- ════════════════════════════════════════════════

-- 1. Профілі користувачів
create table if not exists public.profiles (
  id              uuid references auth.users(id) on delete cascade primary key,
  created_at      timestamptz default now(),
  usage_count     int         default 0,
  usage_date      date        default current_date,
  style           text        default 'friendly',
  lang            text        default 'auto',
  own_key_gemini  text,
  own_key_groq    text
);

-- 2. Пам'ять Qbob (ім'я, місто, інтереси тощо)
create table if not exists public.memory (
  id         uuid        default gen_random_uuid() primary key,
  user_id    uuid        references public.profiles(id) on delete cascade not null,
  key        text        not null,
  value      text        not null,
  created_at timestamptz default now(),
  unique (user_id, key)
);

-- 3. Кеш сервісів (погода, курси, новини)
create table if not exists public.cache (
  key        text        primary key,
  value      jsonb       not null,
  expires_at timestamptz not null,
  created_at timestamptz default now()
);

-- 4. Автоматично створювати профіль при реєстрації
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 5. RLS (Row Level Security) — кожен бачить тільки своє
alter table public.profiles enable row level security;
alter table public.memory    enable row level security;
alter table public.cache     enable row level security;

-- Profiles: читати/писати тільки свій рядок
create policy "profiles_select" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update" on public.profiles for update using (auth.uid() = id);

-- Memory: тільки свої записи
create policy "memory_select" on public.memory for select using (auth.uid() = user_id);
create policy "memory_insert" on public.memory for insert with check (auth.uid() = user_id);
create policy "memory_update" on public.memory for update using (auth.uid() = user_id);
create policy "memory_delete" on public.memory for delete using (auth.uid() = user_id);

-- Cache: публічний для читання, service_role для запису
create policy "cache_select" on public.cache for select using (true);

-- 6. Індекси для швидкості
create index if not exists idx_memory_user_id on public.memory(user_id);
create index if not exists idx_cache_expires  on public.cache(expires_at);

-- ════════════════════════════════════════════════
--  ГОТОВО. Тепер іди в Authentication → Settings
--  і вимкни "Confirm email" якщо хочеш без підтвердження пошти
-- ════════════════════════════════════════════════
