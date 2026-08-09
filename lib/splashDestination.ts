// Simple module-level ref to pass the auth destination to the splash screen.
// The splash screen reads this after its animation completes.
let _destination = '/(auth)/login';

export function setSplashDestination(dest: string) {
  _destination = dest;
}

export function getSplashDestination(): string {
  return _destination;
}
