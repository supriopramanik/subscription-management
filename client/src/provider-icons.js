// Provider identity comes from the billing vendor, not the hosted domain's website.
const providers = [
  { match: /^Hostinger\b/i, name: 'Hostinger', icon: '/providers/hostinger.ico' },
  { match: /^Namecheap\b/i, name: 'Namecheap', icon: '/providers/namecheap.png' },
  { match: /^(OpenAI|ChatGPT)\b/i, name: 'OpenAI', icon: '/providers/openai.png' },
  { match: /^Tasjeel\b/i, name: 'Tasjeel.ae', icon: '/providers/tasjeel.png' },
  { match: /^BTCL\b/i, name: 'BTCL', icon: '/providers/btcl-mark.png' },
  { match: /^Limda\s+Host\b/i, name: 'Limda Host', icon: '/providers/limda.ico' },
];

export function providerForSubscription(sub) {
  return providers.find((provider) => provider.match.test(sub.vendor || '')) || null;
}
