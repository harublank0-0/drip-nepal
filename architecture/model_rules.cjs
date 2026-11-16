/*
 * Rule 5 of T-ARCH-001 (docs/09 §2.4): a module, and the models of the
 * tables it owns, import only the models of tables that the module or a
 * module below it owns (docs/09 §2.2). One rule per module, generated
 * from architecture/model-ownership.json and the `allowedFor` of
 * .dependency-cruiser.cjs.
 */
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

module.exports = function modelRules(ownership, allowedFor, modules) {
  const modelsOf = (module) =>
    Object.values(ownership.tables)
      .filter((table) => table.module === module && table.model)
      .map((table) => `^${escape(table.model)}$`)

  return modules.map((module) => {
    const allowed = new Set([module, ...allowedFor(module)])
    const foreign = modules.filter((other) => !allowed.has(other)).flatMap(modelsOf)
    return {
      name: `models-${module}`,
      comment: `${module} and its models import only models of tables owned by ${module} or a module it may use (docs/09 §2.4 rule 5)`,
      severity: 'error',
      from: { path: [`^app/modules/${module}/`, ...modelsOf(module)] },
      to: { path: foreign.length > 0 ? foreign : ['^$'] },
    }
  })
}
