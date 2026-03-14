/** Sortable, filterable table of all imported workouts. */
export default function WorkoutList() {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead>
          <tr>
            <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Date</th>
            <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Title</th>
            <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Instructor</th>
            <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Duration</th>
            <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">Output</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          <tr>
            <td className="px-4 py-2 text-sm text-gray-400" colSpan={5}>
              No workouts yet. Import a CSV or sync with the Peloton API.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
