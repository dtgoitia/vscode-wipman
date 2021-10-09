import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';

import {removeTrailingCommas} from '../../extension';


suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  // test('Sample test', () => {
  //   assert.strictEqual(-1, [1, 2, 3].indexOf(5));
  //   assert.strictEqual(-1, [1, 2, 3].indexOf(0));
  // });

  test("Remove trailing commas from JSON string", () => {
    const withCommas = `{"a":1,"b":2,}`;
    const withoutCommas = `{"a":1,"b":2}`;
    assert.strictEqual(removeTrailingCommas(withCommas), withoutCommas);

    // const withCommas = `{
    //   "a": 1,
    //   "b": [
    //     2,
    //   ],
    //   "c": {
    //     "c1": 3,
    //   },
    // }`;
    // const withoutCommas = `{"a":1,"b":[2],"c":{"c1":3}}`;
    // assert.equal(removeTrailingCommas(withCommas), withoutCommas);
  });
});

