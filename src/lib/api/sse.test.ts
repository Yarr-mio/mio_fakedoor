import { describe, expect, it } from 'vitest';
import { parseSseBlock } from './sse';

describe('sse block parse', () => {
  it('reads event name and json data', () => {
    expect(parseSseBlock('event: delta\ndata: {"chunk":"안녕","msgId":"m1"}')).toEqual({
      event: 'delta',
      data: { chunk: '안녕', msgId: 'm1' },
    });
  });

  it('reads replace event name with a dot', () => {
    expect(parseSseBlock('event: delta.replace\ndata: {"safeResponse":"safe","msgId":"m1"}')).toEqual({
      event: 'delta.replace',
      data: { safeResponse: 'safe', msgId: 'm1' },
    });
  });
});
