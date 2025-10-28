/**
 * check if the website is a demo website
 */
export function isDemoWebsite() {
  return process.env.NEXT_PUBLIC_DEMO_WEBSITE === 'true';
}
