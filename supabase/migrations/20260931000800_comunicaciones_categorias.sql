-- Fase 9 (Diogo) · Amplía communication_purpose de 2 a 8 valores.
--
-- El prompt de la iteración pide categorías por módulo para que preferencias,
-- templates y auditoría puedan diferenciar el origen de una comunicación.
-- Sigue sin existir 'marketing' (A14, docs/07-decisiones.md): fuera de
-- alcance por decisión explícita, no un olvido.
--
-- ALTER TYPE ... ADD VALUE no puede usarse en la misma transacción en la que
-- se añade (restricción de Postgres): cualquier función que referencie estos
-- valores nuevos debe ir en una migración posterior. Por eso esta migración
-- solo amplía el enum; 20260931000900 y 20260931001000 son las que ya pueden
-- usarlo.

alter type communication_purpose add value 'services';
alter type communication_purpose add value 'groups';
alter type communication_purpose add value 'events';
alter type communication_purpose add value 'discipleship';
alter type communication_purpose add value 'kids';
alter type communication_purpose add value 'pastoral';
alter type communication_purpose add value 'system';

comment on type communication_purpose is
  'Categoría/finalidad de la comunicación (A14 + iteración de categorías). institutional/operational/system son siempre obligatorias (nunca admiten opt-out, ver communication_category_preferences). services/groups/events/discipleship/kids/pastoral son categorías opcionales por módulo, sujetas a preferencia de la persona. Nunca "marketing": no implementado en esta fase.';
