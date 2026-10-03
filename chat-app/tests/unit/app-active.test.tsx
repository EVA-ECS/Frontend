import { AppState, Platform, type AppStateStatus } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { useAppActive } from '../../src/chat/use-app-active';
test('native foreground events update activity and subscriptions are removed', async () => {
  Object.defineProperty(Platform, 'OS', { value: 'ios', writable: true, configurable: true });
  let change!: (state: AppStateStatus) => void; const remove = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, fn) => { change = fn; return { remove }; });
  const hook = await renderHook(useAppActive);
  await act(() => change('background')); expect(hook.result.current).toBe(false);
  await act(() => change('active')); expect(hook.result.current).toBe(true);
  await hook.unmount(); expect(remove).toHaveBeenCalledTimes(1);
});
test('web activity needs both visible document and focus, and removes event listeners', async () => {
  Object.defineProperty(Platform, 'OS', { value: 'web', writable: true, configurable: true });
  let focus = true; const events = new Map<string, () => void>();
  const documentMock = { visibilityState: 'visible', hasFocus: () => focus, addEventListener: jest.fn((key: string, fn: () => void) => events.set(key, fn)), removeEventListener: jest.fn() };
  const windowMock = { addEventListener: jest.fn((key: string, fn: () => void) => events.set(key, fn)), removeEventListener: jest.fn() };
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  Object.defineProperty(globalThis, 'document', { value: documentMock, writable: true, configurable: true });
  Object.defineProperty(globalThis, 'window', { value: windowMock, writable: true, configurable: true });
  try {
    const hook = await renderHook(useAppActive); expect(hook.result.current).toBe(true);
    focus = false; await act(() => events.get('blur')!()); expect(hook.result.current).toBe(false);
    focus = true; documentMock.visibilityState = 'hidden'; await act(() => events.get('visibilitychange')!()); expect(hook.result.current).toBe(false);
    documentMock.visibilityState = 'visible'; await act(() => events.get('focus')!()); expect(hook.result.current).toBe(true);
    await hook.unmount(); expect(windowMock.removeEventListener).toHaveBeenCalledTimes(2); expect(documentMock.removeEventListener).toHaveBeenCalledTimes(1);
  } finally {
    Object.defineProperty(globalThis, 'window', { value: oldWindow, writable: true, configurable: true });
    Object.defineProperty(globalThis, 'document', { value: oldDocument, writable: true, configurable: true });
  }
});
