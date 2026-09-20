-- Fase 13 · La política de alta de personas deja de admitir identidades ajenas.
--
-- Hallazgo de la auditoría de aislamiento, comprobado contra el esquema real:
-- `people_insert` estaba declarada `with check (true)`, así que cualquier
-- cuenta autenticada podía insertar filas en `people`, incluidas filas con el
-- `user_id` de OTRA cuenta.
--
-- Qué NO permitía, comprobado también, porque conviene no exagerar el hallazgo:
-- esa fila no se puede vincular a ninguna iglesia —`church_people` exige
-- `people.manage` y el intento falla con 42501— así que no daba acceso a datos
-- ajenos ni convertía a nadie en miembro de nada. La premisa con la que se
-- escribió la política en la Fase 2 («la fila es inerte hasta vincularse») se
-- sostiene.
--
-- Lo que sí permitía, y es suficiente para arreglarlo:
--
--   * Sembrar filas con el user_id de otra persona. `app.current_person_ids()`
--     resuelve por user_id, así que la víctima pasaría a tener dos identidades
--     en el sistema, una de ellas creada por un tercero. Cualquier consulta que
--     dé por supuesto que un usuario es una persona se comportaría de forma
--     rara, y si algún día un administrador vincula esa fila creyéndola
--     legítima, mete en su iglesia a alguien que nunca lo pidió.
--   * Crear filas sin límite, que es ruido en la tabla central del dominio.
--
-- La corrección conserva el caso de uso que motivó la política —el alta manual
-- necesita crear la persona antes de vincularla, y no puede exigir que ya esté
-- en church_people— y añade la única condición que faltaba: una persona nace
-- sin cuenta, o con la de quien la está creando.

drop policy people_insert on people;

create policy people_insert on people
  for insert to authenticated
  with check (user_id is null or user_id = auth.uid());

comment on policy people_insert on people is
  'Alta de persona desde la aplicación. La fila es inerte hasta vincularse con church_people, que exige people.manage; y no puede nacer con la identidad de otra cuenta, que es lo que permitía la versión anterior (with check true). Ver la auditoría de la Fase 13.';

-- El volumen sigue sin limitarse: una cuenta puede crear muchas filas sueltas
-- en `people`. No se resuelve aquí porque RLS no es el sitio para un límite de
-- frecuencia, y la vía normal de alta (app.create_person) sí exige capacidad.
-- Queda anotado como deuda conocida en docs/FASE-13-OPERACION-ESCALA.md.
