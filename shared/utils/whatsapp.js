export function whatsappNumber(value = '') {
  let number = String(value || '').replace(/[\s()+-]/g, '')
  if (number.startsWith('0')) number = '62' + number.slice(1)
  return /^[1-9]\d{7,14}$/.test(number) ? number : null
}
export function whatsappUrl(phone, message) {
  const number = whatsappNumber(phone)
  return number ? `https://wa.me/${number}?${new URLSearchParams({ text: message })}` : null
}
