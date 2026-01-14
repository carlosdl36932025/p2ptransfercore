export type ParseSuccess<T> = {
  success: true;
  data: T;
};

export type ParseFailure = {
  success: false;
  error: string;
};

export type ParseResult<T> = ParseSuccess<T> | ParseFailure;