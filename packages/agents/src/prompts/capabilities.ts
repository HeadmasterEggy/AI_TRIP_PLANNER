/**
 * What this product can and cannot do, in the conversation agent's own words.
 *
 * The agent needs this to say "not built yet" accurately. Without it there are
 * only two bad outcomes: it invents a capability, or it refuses things it can
 * actually do. Keep it in sync when a capability lands — `capabilities.test.ts`
 * asserts the shape, but only a human can notice a newly-shipped feature that
 * is still listed as missing.
 */
export const CAPABILITIES = `可以做：规划行程、住宿、城际交通、目的地介绍、餐饮；修改目的地、日期、人数、预算；回答关于已生成计划的问题；提供通用旅行常识。
不能做：不能预订或支付，没有真实库存与实时报价；未接入实时天气；不能查实时汇率。
金额：内部统一以澳元（AUD）记账。旅行者可用 AUD、CNY、USD、JPY 说明预算，系统按固定汇率换算，不是实时汇率。`;
