set timezone = 'UTC';
set datestyle = 'ISO, MDY';
set extra_float_digits = 3;
select 'courses' as tbl, count(*)::int as rows, md5(coalesce(string_agg(t::text, '' order by t::text), '')) as hash from public.courses t
union all select 'admin_audit_log', count(*)::int, md5(coalesce(string_agg(t::text, '' order by t::text), '')) from public.admin_audit_log t
union all select 'quiz_attempt', count(*)::int, md5(coalesce(string_agg(t::text, '' order by t::text), '')) from public.quiz_attempt t
union all select 'user_entitlements', count(*)::int, md5(coalesce(string_agg(t::text, '' order by t::text), '')) from public.user_entitlements t
union all select 'lesson_completion', count(*)::int, md5(coalesce(string_agg(t::text, '' order by t::text), '')) from public.lesson_completion t
union all select 'quiz_run', count(*)::int, md5(coalesce(string_agg(t::text, '' order by t::text), '')) from public.quiz_run t
union all select 'read_progress', count(*)::int, md5(coalesce(string_agg(t::text, '' order by t::text), '')) from public.read_progress t
union all select 'user_profiles', count(*)::int, md5(coalesce(string_agg(t::text, '' order by t::text), '')) from public.user_profiles t
union all select 'user_roles', count(*)::int, md5(coalesce(string_agg(t::text, '' order by t::text), '')) from public.user_roles t
union all select 'catalog_sections', count(*)::int, md5(coalesce(string_agg(t::text, '' order by t::text), '')) from public.catalog_sections t
union all select 'catalog_groups', count(*)::int, md5(coalesce(string_agg(t::text, '' order by t::text), '')) from public.catalog_groups t
union all select 'course_prerequisites', count(*)::int, md5(coalesce(string_agg(t::text, '' order by t::text), '')) from public.course_prerequisites t
union all select 'completion_events', count(*)::int, md5(coalesce(string_agg(t::text, '' order by t::text), '')) from public.completion_events t
union all select 'subscriptions', count(*)::int, md5(coalesce(string_agg(t::text, '' order by t::text), '')) from public.subscriptions t
order by 1;
