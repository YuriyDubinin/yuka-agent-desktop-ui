export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const relative = specifier.startsWith('./') || specifier.startsWith('../');
    if (relative && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context);
    }
    throw error;
  }
}
