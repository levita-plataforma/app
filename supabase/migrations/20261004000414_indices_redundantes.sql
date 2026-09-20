-- Fase 13 · Retirar índices que duplican a otro índice idéntico.
--
-- Una restricción `unique` crea su propio índice. Cuando además se declara un
-- índice normal sobre las mismas columnas, quedan dos estructuras idénticas:
-- las dos se mantienen en cada escritura, las dos ocupan espacio, y el
-- planificador solo puede usar una. Ninguna consulta gana nada.
--
-- Pasó ocho veces, repartidas por siete fases distintas y sin relación entre
-- ellas, lo que indica que es un descuido fácil de cometer: se escribe el
-- índice pensando en la consulta y la restricción pensando en la integridad,
-- sin caer en que la segunda ya trae el primero. Por eso se añade también un
-- invariante en invariantes_aislamiento_test.sql, para que la novena vez falle
-- en CI en lugar de esperar a que alguien lo mire.
--
-- No hay cambio de comportamiento: el índice que queda tiene exactamente las
-- mismas columnas, en el mismo orden, sobre la misma tabla. Lo que se pierde
-- es trabajo duplicado.

-- people: people_pkey ya indexa (id). people_id_unique nació en la Fase 2
-- junto a la clave primaria y ninguna clave foránea lo referencia —las 77 que
-- apuntan a people usan la primaria—, así que se va sin más.
-- Es una restricción, no un índice suelto, así que se suelta por ahí: un
-- «drop index» sobre el índice que la respalda lo rechaza.
alter table people drop constraint if exists people_id_unique;
drop index if exists people_id_unique;

-- churches_slug_key (unique) ya indexa (slug).
drop index if exists churches_slug_idx;

-- church_onboarding_church_id_key (unique) ya indexa (church_id).
drop index if exists church_onboarding_church_id_idx;

-- subscriptions_church_id_key (unique) ya indexa (church_id).
drop index if exists subscriptions_church_id_idx;

-- events_church_id_public_slug_key (unique) ya indexa (church_id, public_slug).
drop index if exists events_church_slug_idx;

-- registrations_church_id_registration_code_key (unique) ya indexa
-- (church_id, registration_code).
drop index if exists registrations_code_idx;

-- kids_profiles_church_id_person_id_key (unique) ya indexa
-- (church_id, person_id).
drop index if exists kids_profiles_church_person_idx;

-- worship_repertoire_songs_repertoire_id_position_key (unique) ya indexa
-- (repertoire_id, position).
drop index if exists worship_repertoire_songs_repertoire_idx;

-- El índice de trigramas de la Fase 2 -----------------------------------------
--
-- people_search_name_trgm_idx está sobre la concatenación de los tres nombres.
-- Se creó para una búsqueda por similitud que no llegó a implementarse, y hoy
-- ninguna consulta del proyecto lo usa: el directorio busca con cinco ilike
-- por columna, que no encajan con esa expresión.
--
-- No se elimina porque la búsqueda por similitud sigue siendo una idea
-- razonable y volver a construirlo sería fácil de olvidar. Pero se le pone la
-- misma opción que a los demás, para que quien la implemente no herede el
-- problema de la lista pendiente que se documenta en 20261004000413.
alter index people_search_name_trgm_idx set (fastupdate = off);
