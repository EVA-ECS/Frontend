import React from 'react';
import { Platform } from 'react-native';
import { render } from '@testing-library/react-native';
import RootLayout from '../../src/app/_layout';
import Loading from '../../src/app/loading';
import AuthenticatedLayout from '../../src/app/(authenticated)/_layout';
import Index from '../../src/app/(authenticated)/index';
import { useAuth } from '../../src/auth/auth-context';
jest.mock('../../src/auth/auth-context', () => ({ useAuth: jest.fn(), AuthProvider: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('../../src/components/chat-workspace', () => {
  const { Text } = require('react-native');
  return { __esModule: true, default: () => <Text>Workspace</Text> };
});
jest.mock('expo-router', () => {
  const { Text } = require('react-native');
  const Stack = ({ children }: { children: React.ReactNode }) => children;
  Stack.Protected = ({ guard, children }: { guard: boolean; children: React.ReactNode }) => guard ? children : null;
  Stack.Screen = ({ name }: { name: string }) => <Text>{name}</Text>;
  return { Stack };
});
test.each([
  [true, null, ['loading']], [false, null, ['sign-in', 'register']], [false, { user: { userId: 'alice' } }, ['(authenticated)']],
])('navigation only exposes the appropriate routes', async (isLoading, session, names) => {
  jest.mocked(useAuth).mockReturnValue({ isLoading, session } as ReturnType<typeof useAuth>);
  const screen = await render(<RootLayout />);
  for (const name of ['loading', 'sign-in', 'register', '(authenticated)']) expect(!!screen.queryByText(name)).toBe(names.includes(name));
});
test('loading shows a spinner and the authenticated index opens its workspace', async () => {
  const screen = await render(<Loading />);
  expect(screen.container.queryAll(node => /ActivityIndicator|ProgressBar/.test(node.type))).toHaveLength(1);
  await screen.rerender(<AuthenticatedLayout />);
  await screen.rerender(<Index />); expect(screen.getByText('Workspace')).toBeTruthy();
});
test.each(['web', 'ios', 'android'] as const)('theme supplies readable foregrounds and platform fonts for %s', platform => {
  const previous = Platform.OS; Object.defineProperty(Platform, 'OS', { value: platform, writable: true, configurable: true });
  jest.isolateModules(() => {
    const theme = require('../../src/constants/theme');
    expect(theme.Colors.light.text).not.toBe(theme.Colors.light.background);
    expect(theme.Colors.dark.text).not.toBe(theme.Colors.dark.background);
    expect(theme.Fonts.mono).toBeTruthy();
    expect(theme.Spacing.three).toBeGreaterThan(theme.Spacing.two);
    expect(theme.MaxContentWidth).toBeGreaterThan(0);
  });
  Object.defineProperty(Platform, 'OS', { value: previous, writable: true, configurable: true });
});
