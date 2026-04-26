const buildMeta = (meta = {}) => {
  return Object.entries(meta).reduce((acc, [key, value]) => {
    if (value !== undefined) {
      acc[key] = value;
    }

    return acc;
  }, {});
};

export const logControllerStart = (controllerName, meta) => {
  console.log(`[controller] ${controllerName} started`, buildMeta(meta));
};

export const logControllerSuccess = (controllerName, meta) => {
  console.log(`[controller] ${controllerName} succeeded`, buildMeta(meta));
};

export const logControllerError = (controllerName, error, meta) => {
  console.error(`[controller] ${controllerName} failed`, {
    ...buildMeta(meta),
    message: error.message,
    stack: error.stack
  });
};
