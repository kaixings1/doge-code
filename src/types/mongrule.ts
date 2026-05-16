type OrCondition = {
  $or: ConditionInterface[];
};
type NorCondition = {
  $nor: ConditionInterface[];
};
type AndCondition = {
  $and: ConditionInterface[];
};
type NotCondition = {
  $not: ConditionInterface;
};
/** 支持的条件运算符类型 */
export type Operator =
  | "$in"
  | "$ini"
  | "$inGroup"
  | "$nin"
  | "$nini"
  | "$notInGroup"
  | "$gt"
  | "$gte"
  | "$lt"
  | "$lte"
  | "$regex"
  | "$regexi"
  | "$ne"
  | "$eq"
  | "$size"
  | "$elemMatch"
  | "$all"
  | "$alli"
  | "$not"
  | "$type"
  | "$exists"
  | "$vgt"
  | "$vgte"
  | "$vlt"
  | "$vlte"
  | "$vne"
  | "$veq";
/**
 * 条件中使用的变量类型
 */
export type VarType =
  | "string"
  | "number"
  | "boolean"
  | "array"
  | "object"
  | "null"
  | "undefined";
/** 运算符条件值 — 指定运算符及其对应的比较值 */
export type OperatorConditionValue = {
  $in?: (string | number)[];
  $ini?: (string | number)[];
  $inGroup?: string;
  $nin?: (string | number)[];
  $nini?: (string | number)[];
  $notInGroup?: string;
  $gt?: number | string;
  $gte?: number | string;
  $lt?: number | string;
  $lte?: number | string;
  $regex?: string;
  $regexi?: string;
  $ne?: number | string;
  $eq?: number | string;
  $exists?: boolean;
  $all?: ConditionValue[];
  $alli?: ConditionValue[];
  $size?: number | ConditionValue;
  $type?: VarType;
  $elemMatch?: ConditionInterface | OperatorConditionValue;
  $not?: ConditionValue;
};

/** 条件值 — 可以是运算符条件值、字面量或嵌套结构 */
export type ConditionValue =
  | OperatorConditionValue
  | string
  | number
  | boolean
  // eslint-disable-next-line
  | Array<any>
  // eslint-disable-next-line
  | Record<string, any>
  | null;

/** 运算符条件 — 字段名到条件值的映射 */
export type OperatorCondition = {
  [key: string]: ConditionValue;
};

/** 条件接口 — 支持 $or、$nor、$and、$not 逻辑组合及运算符条件 */
export type ConditionInterface =
  | OrCondition
  | NorCondition
  | AndCondition
  | NotCondition
  | OperatorCondition;

/** 父条件接口 — 带唯一 ID 的命名条件，可选门控标志 */
export type ParentConditionInterface = {
  id: string;
  condition: ConditionInterface;
  gate?: boolean;
};

// eslint-disable-next-line
export type TestedObj = Record<string, any>;
