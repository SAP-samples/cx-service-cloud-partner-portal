import { Action, createReducer, on } from '@ngrx/store';
import * as AssignmentsActions from '../assignments-list.actions';
import { createEntityAdapter, EntityAdapter } from '@ngrx/entity';
import { Assignment } from '../../model/assignment';
import { ColumnName } from '../../model/column-name';
import { ColumnState } from '../column-state';
import { assignmentsSortComparer, isActionNotAboutMyColumn } from '../../utils/assignments-columns-helper';
import { bumpPagingTotalsByOneItem } from './bump-paging-totals-by-one-item';

const myColumn: ColumnName = 'ASSIGNMENTS_BOARD_CLOSED';

export const adapter: EntityAdapter<Assignment> = createEntityAdapter<Assignment>({
  selectId: assignment => assignment.id,
  sortComparer: assignmentsSortComparer,
});

export const initialState = (): ColumnState => adapter.getInitialState({
  isLoading: false,
  pagesLoaded: 0,
  totalPages: 0,
  totalElements: 0,
  updatedAssignment: null,
  filter: null,
});

const closedAssignmentsReducer = createReducer(
  initialState(),

  on(
    AssignmentsActions.reset,
    () => initialState(),
  ),

  on(
    AssignmentsActions.setFilter,
    (state, {fetchingFilter}) => ({
      ...state,
      filter: fetchingFilter,
    }),
  ),

  on(
    AssignmentsActions.loadNextPage,
    (state) => ({
      ...state,
      isLoading: true,
    }),
  ),

  on(
    AssignmentsActions.loadNextPageSuccess,
    (state, {response}): ColumnState => ({
      ...adapter.addMany(response.results, state),
      isLoading: false,
      pagesLoaded: state.pagesLoaded + 1,
      totalPages: response.totalPages,
      totalElements: response.totalElements,
    }),
  ),

  on(
    AssignmentsActions.loadNextPageFailure,
    (state) => ({
      ...state,
      isLoading: false,
    }),
  ),

  on(
    AssignmentsActions.closeSuccess,
    (state, {assignment}) => ({
      ...adapter.addOne(assignment, state),
      ...bumpPagingTotalsByOneItem(state.totalPages, state.totalElements),
    }),
  ),

  on(
    AssignmentsActions.setSearchQuery,
    (state, {query}) => ({
      ...adapter.removeAll(state),
      filter: {
        ...state.filter,
        query,
      },
      pagesLoaded: 0,
      totalElements: 0,
      totalPages: 0,
    }),
  ),
);


export function reducer(state: ColumnState | undefined, action: Action & { columnName?: ColumnName }) {
  if (isActionNotAboutMyColumn(action, myColumn)) {
    return state;
  }
  return closedAssignmentsReducer(state, action);
}
