# RGPD y LOPIVI

> Referencia heredada del producto de turnos localizado en `Documents/Levitaapp`. El código de ese producto no está en este checkout de la landing. Las menciones a implementación, comandos y resultados deben contrastarse allí; no son verificaciones realizadas en esta revisión. Ver [índice](README.md).

> **Esto no es asesoramiento jurídico.** Es el análisis de qué datos trata el
> producto y qué decisiones de diseño se toman en consecuencia. Antes de abrir
> la plataforma a iglesias que no sean la piloto, el contrato de encargo, la
> política de privacidad y las referencias legales de este documento tienen que
> pasar por un abogado. Las obligaciones de LOPIVI recaen sobre la iglesia, no
> sobre la herramienta.

---

## Por qué este documento existe

Dos razones, y ninguna es burocrática.

**El roster de una iglesia revela la religión de quien aparece en él.** No hace
falta una columna «religión»: estar en la base de datos de voluntarios de una
iglesia evangélica ya lo dice. Y la religión es una categoría especial de datos
en el artículo 9 del RGPD, con protección reforzada.

**El área de niños obliga a tratar datos penales de los voluntarios.** El
certificado de delitos de naturaleza sexual es información relativa a
antecedentes penales, que el RGPD trata aparte del resto y con restricciones
propias.

Un producto que guarde las dos cosas sin haberlo pensado es un incidente
esperando a ocurrir.

---

## Quién es quién

| Papel | Quién | Qué significa |
|---|---|---|
| Responsable del tratamiento | **La iglesia** | Decide qué datos recoge y para qué |
| Encargado del tratamiento | **La plataforma** | Los trata por cuenta de la iglesia, siguiendo sus instrucciones |
| Subencargados | Supabase, Vercel, Resend, Stripe | Proveedores de la plataforma |

Consecuencia práctica: **hace falta un contrato de encargo de tratamiento con
cada iglesia**, firmado antes de que suba un solo dato. No es papeleo opcional;
es lo que legitima que la plataforma tenga esos datos. Debe listar los
subencargados y permitir que la iglesia se oponga a cambios.

Y a la inversa: la iglesia es la responsable, así que las peticiones de
supresión o de acceso le llegan a ella. El producto tiene que darle las
herramientas para atenderlas sin escribirnos un correo.

---

## Qué datos trata el producto

### Voluntarios adultos

| Dato | Para qué | Base jurídica |
|---|---|---|
| Nombre y apellidos | Identificar quién sirve | Interés legítimo de la entidad |
| Correo | Invitación y avisos | Interés legítimo |
| Teléfono | Contacto urgente | Interés legítimo · **opcional** |
| Área, puesto, nivel | Programar | Interés legítimo |
| Historial de servicio | Rotación justa y evitar el quemado | Interés legítimo |
| Bloqueos de disponibilidad | No asignar a quien no puede | Interés legítimo |
| Suscripción push | Enviar avisos | Consentimiento (el del navegador) |

**Pertenencia a la iglesia.** Como decíamos, es dato de categoría especial. El
artículo 9.2 del RGPD contempla una excepción para el tratamiento que llevan a
cabo fundaciones, asociaciones y otras entidades sin ánimo de lucro con
finalidad religiosa, referido a sus miembros, con garantías adecuadas y con una
condición que importa mucho aquí: **los datos no se comunican fuera de la
entidad sin consentimiento de los interesados**.

De ahí sale una regla de diseño que ya está implementada: el aislamiento entre
iglesias no es una funcionalidad de producto, es el cumplimiento de esa
condición. Y otra que hay que respetar en el futuro: **nada de directorios
compartidos entre iglesias, ni de estadísticas agregadas que permitan
reidentificar**.

### El motivo del bloqueo, que es una trampa

`blockouts.reason` es texto libre. Alguien escribirá «operación de rodilla» o
«tratamiento médico», y eso convierte un campo inocente en un dato de salud.

Tres decisiones:

- El campo es **opcional** y la interfaz no lo pide con insistencia.
- El texto de ayuda sugiere el nivel adecuado: «viaje», «asuntos personales».
- Lo ven quien lo escribió y quien administra la iglesia. No el resto del
  equipo, que solo necesita saber que esa persona no está disponible.

### Credenciales — el dato más delicado

Se guarda **el tipo de credencial, la fecha de emisión, la de caducidad y quién
la verificó**. Nada más.

**No se guarda el documento.** Ni el PDF, ni el número, ni una copia. Esto no es
prudencia excesiva: almacenar un certificado de antecedentes penales de decenas
de voluntarios por iglesia es acumular un riesgo enorme sin ninguna ventaja
operativa. Lo único que el sistema necesita saber es si está en vigor.

Acceso: owner y admin de esa iglesia, y la persona interesada a su propio
registro. **El líder del área no lo ve** — solo necesita saber si puede asignar
a alguien, y eso lo responde la validación, no la lectura de la fila. Está en
las políticas RLS de `02-datos-y-rls.md`.

Base jurídica: cumplimiento de una obligación legal, la Ley Orgánica 8/2021.

### Menores

**Fuera del alcance.** El producto no guarda ningún dato de menores: ni nombres,
ni alergias, ni quién los recoge. Eso es un check-in de niños, que es otro
producto con otro perfil de riesgo, y está explícitamente descartado en
`docs/areas/06-ninos.md`.

Los datos del área de niños que sí se tratan son los de los **voluntarios
adultos** que sirven ahí.

---

## Retención

| Dato | Cuánto se conserva |
|---|---|
| Persona activa | Mientras siga en la iglesia |
| Persona inactiva | 12 meses, y luego anonimización |
| Historial de servicio | Se anonimiza con la persona: la estadística del área sobrevive, el nombre no |
| Bloqueos pasados | 12 meses |
| Credenciales | Hasta 12 meses después de caducar, para acreditar que en su día se verificó |
| Cola de avisos | 90 días |
| Bitácora de auditoría | 24 meses |
| Suscripciones push | Se borran en cuanto el servidor de push devuelve 404 o 410 |

«Anonimizar» aquí significa de verdad: sustituir el nombre por un identificador
y borrar correo y teléfono, conservando las filas de historial para que las
estadísticas del área no se rompan. No es lo mismo que borrar, y la diferencia
hay que explicarla en la política de privacidad.

---

## Derechos, y cómo se atienden

La iglesia es la responsable, así que necesita poder resolverlos sola desde el
panel:

| Derecho | Cómo se implementa |
|---|---|
| Acceso | Botón de exportar la ficha completa de una persona en JSON o PDF |
| Rectificación | Ya está: cada cual edita su nombre, teléfono y correo |
| Supresión | «Dar de baja y anonimizar», con aviso claro de qué se conserva y por qué |
| Oposición | Desactivar los avisos por canal, y darse de baja del área |
| Portabilidad | La misma exportación del derecho de acceso |
| Limitación | Marcar a la persona como inactiva: deja de aparecer para programar |

Rectificación ya existía. Acceso, portabilidad y supresión tienen hecha la parte
de base de datos (`public.exportar_persona()` y `public.anonimizar_persona()`,
bloque E5); falta el botón en el panel. Oposición y limitación llegan con sus
pantallas. La supresión es la que hay que tener **antes** de abrir a iglesias
que no sean la piloto.

---

## Dónde están los datos

Todo en la Unión Europea, y no por preferencia:

- **Supabase** en Frankfurt o Irlanda. Base de datos, autenticación, ficheros.
- **Vercel** con funciones en `fra1`.
- **Resend** para el correo transaccional: verificar que la región es UE.
- **Stripe** para la facturación, cuando llegue.

Cada uno es un subencargado y tiene que aparecer en el contrato de encargo. Si
alguno se cambia por otro, hay que avisar a las iglesias.

---

## LOPIVI

La **Ley Orgánica 8/2021** de protección integral a la infancia y la
adolescencia frente a la violencia obliga a las entidades que tienen contacto
habitual con menores. Una iglesia con escuela dominical lo es.

### Qué obliga a la iglesia

**Certificado de delitos de naturaleza sexual** para quien trabaje en contacto
habitual con menores. El Ministerio de Justicia lo dice sin matices: aplica a
«profesionales y voluntarios». Cubre la escuela dominical y también el grupo de
adolescentes — un chico de 15 años sigue siendo menor, y esa es la laguna que
más se pasa por alto.

**Protocolo de actuación** adaptado a la actividad real de la entidad, no una
plantilla genérica.

**Formación** de quien trabaja con menores: reconocer señales de alarma y saber
cómo actuar.

### Qué puede hacer el producto

No puede cumplir la ley por la iglesia, pero sí puede ponérselo fácil:

- **Impedir** la asignación sin certificado en vigor, en lugar de avisar.
- **Avisar 60 días antes** de cada caducidad, porque renovarlo lleva tiempo y
  nadie se acuerda hasta que ya no puede servir.
- **Registrar quién verificó cada credencial y cuándo**: rastro de auditoría sin
  guardar el documento.
- **Aplicar la regla de dos adultos** al publicar un turno de niños.
- **Dar al líder una vista** de quién cumple los requisitos y quién no.

### Y el argumento comercial

Muchas iglesias pequeñas no saben que esto les aplica. Si las entrevistas
confirman que la mayoría no pide el certificado, esto deja de ser una función y
pasa a ser una razón para adoptar la herramienta: les ayuda a cumplir algo que
hoy incumplen sin saberlo.

---

## Qué hay que construir

Ordenado por cuándo hace falta.

**Antes del piloto**

- [ ] Política de privacidad, y aviso en el alta de la iglesia
- [ ] Texto informativo en la invitación: qué datos se guardan y para qué
- [ ] `blockouts.reason` opcional, con la ayuda que guía al nivel correcto

**Antes de la segunda iglesia**

- [ ] Contrato de encargo de tratamiento, revisado por abogado
- [x] Exportación de la ficha de una persona (acceso y portabilidad) — base de
      datos hecha; falta el botón en el panel
- [x] «Dar de baja y anonimizar», con lo que conserva bien explicado — base de
      datos hecha; falta la pantalla que lo explique al confirmar
- [ ] Registro de actividades de tratamiento, que lleva la plataforma como
      encargada

**Con el bloque A0**

- [ ] RLS de `person_credentials` según `02-datos-y-rls.md`
- [ ] Test de aislamiento: **un líder de área no puede leer credenciales**
- [ ] Aviso de caducidad a 60 días
- [ ] Nunca aceptar la subida del documento, ni siquiera como adjunto opcional

**Antes de abrirlo a cualquiera**

- [x] Trabajos de retención automáticos con los plazos de la tabla —
      `app.aplicar_retencion()`; falta programarla con `pg_cron` al desplegar
- [ ] Procedimiento de notificación de brechas: 72 horas al responsable
- [ ] Revisión completa por abogado
