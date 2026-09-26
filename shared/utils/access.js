const belongs = (path, root) => path === root || path.startsWith(root + '/')
export function locationAdminPageAllowed(path) {
  return ['/dashboard', '/orders', '/therapists'].some(root => belongs(path, root)) || path === '/dispatch'
}
export function locationAdminApiAllowed(method, path) {
  const [resource, id, action] = path
  if (['auth', 'notifications', 'dashboard', 'orders', 'therapists'].includes(resource)) return true
  // Billing flags are read-only references required to calculate an order.
  return method === 'GET' && resource === 'settings' && id === 'billing' && !action
}
