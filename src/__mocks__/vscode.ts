const fakeOutputChannel = {
  appendLine: () => { },
}

// mock the vscode API which you use in your project. Jest will tell you which keys are missing
// source: https://github.com/microsoft/vscode-test/issues/37#issuecomment-584744386
export const OutputChannel = () => ({});
export const window = {
  createOutputChannel: () => fakeOutputChannel,
};
