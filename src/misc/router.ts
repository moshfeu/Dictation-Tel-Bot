export const Routes = {
  ADD: 'add' as 'add',
  TEST: 'test' as 'test',
  START: 'start' as 'start'
}

export type Route = typeof Routes[keyof typeof Routes];

let _route: Route;
export const getRoute = (): Route => {
  return _route;
}

export const setRoute = (route: Route): void => {
  _route = route;
}