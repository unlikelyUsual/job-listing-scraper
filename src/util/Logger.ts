export default class Logger {
  debug(message: string, ...rest: unknown[]): void {
    console.debug(message, ...rest);
  }

  error(message: string, ...rest: unknown[]): void {
    console.error(message, ...rest);
  }
}
