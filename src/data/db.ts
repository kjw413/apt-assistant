// IndexedDB 스키마 v1(spec §6.4). 테이블은 처음에 모두 만들고 기본 키만 둔다.
import Dexie, { type Table } from 'dexie';
import type { AliasEntry, ExamProfile, ImportRecord, ProblemSet, Session, Taxonomy } from '../domain/types';

export interface KvRow {
  key: string;
  value: unknown;
}

export class AptDb extends Dexie {
  // declare: ES2022 클래스 필드 초기화가 Dexie가 붙인 테이블을 덮어쓰지 않게 한다.
  declare profiles: Table<ExamProfile, string>;
  declare sets: Table<ProblemSet, string>;
  declare sessions: Table<Session, string>;
  declare imports: Table<ImportRecord, string>;
  declare taxonomy: Table<Taxonomy, string>;
  declare aliases: Table<AliasEntry, string>;
  declare kv: Table<KvRow, string>;

  constructor(name = 'apt-assistant') {
    super(name);
    this.version(1).stores({
      profiles: 'id',
      sets: 'id',
      sessions: 'id',
      imports: 'id',
      taxonomy: 'profileId',
      aliases: 'key',
      kv: 'key',
    });
  }
}
