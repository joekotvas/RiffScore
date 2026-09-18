import { assertExtensionCompatibility, RIFFSCORE_EXTENSION_CONTRACT } from '../extensions';
test('compatible packages pass; mismatches identify the extension and missing contract', () => {
  const descriptor = {
    id: 'example',
    version: '1',
    contract: RIFFSCORE_EXTENSION_CONTRACT,
    capabilities: ['viewport-resolver'],
  };
  expect(() => assertExtensionCompatibility(descriptor)).not.toThrow();
  expect(() => assertExtensionCompatibility({ ...descriptor, contract: 99 })).toThrow(
    'example@1 requires RiffScore extension contract 99'
  );
  expect(() => assertExtensionCompatibility({ ...descriptor, capabilities: ['unknown'] })).toThrow(
    'missing capabilities: unknown'
  );
});
