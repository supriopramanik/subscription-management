export function publicDomain(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(
      /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`
    );
    const domain = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    if (
      domain.length > 253 ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)
    )
      return '';
    if (/\.(?:local|localhost|internal|test|example|invalid|onion)$/.test(domain)) return '';
    return domain;
  } catch {
    return '';
  }
}

export function websiteForSave(value) {
  const website = (value || '').trim();
  return website && !/^https?:\/\//i.test(website) && publicDomain(website)
    ? `https://${website}`
    : website;
}

export function domainForService(sub) {
  const website = publicDomain(sub.website);
  if (website) return website;
  const nameDomain = sub.name?.match(
    /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\b/i
  )?.[0];
  if (nameDomain) return publicDomain(nameDomain);
  const name = sub.name || '';
  if (/^google\b/i.test(name)) return 'google.com';
  if (/^(chatgpt|openai)\b/i.test(name)) return 'chatgpt.com';
  for (const [brand, domain] of Object.entries({
    Figma: 'figma.com',
    GitHub: 'github.com',
    Vercel: 'vercel.com',
    Cloudinary: 'cloudinary.com',
    Mailchimp: 'mailchimp.com',
    Notion: 'notion.so',
    Slack: 'slack.com',
    Adobe: 'adobe.com',
    Canva: 'canva.com',
    '1Password': '1password.com',
    Netflix: 'netflix.com',
    Microsoft: 'microsoft.com',
  })) {
    if (
      name.toLowerCase() === brand.toLowerCase() ||
      name.toLowerCase().startsWith(`${brand.toLowerCase()} `)
    )
      return domain;
  }
  return '';
}
