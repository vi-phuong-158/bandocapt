const { startPreviewServer, stopPreviewServer } = require('../../scripts/preview-server');

module.exports = async () => {
    await startPreviewServer();
    return async () => {
        await stopPreviewServer();
    };
};
