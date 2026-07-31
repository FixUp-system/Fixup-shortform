// 신원 헤더 이름의 유일한 출처.
//
// middleware 가 여기에 **덮어쓰고**(set) 라우트가 여기서 읽는다. 이름이 두 군데 있으면
// 한쪽만 고치는 날이 오고, 그때 라우트는 신원을 못 읽으면서 500 을 내는 대신 조용히
// 통과할 수도 있다.
export const USER_HEADER = "x-shotform-user";
export const STATUS_HEADER = "x-shotform-status";
export const ROLE_HEADER = "x-shotform-role";
