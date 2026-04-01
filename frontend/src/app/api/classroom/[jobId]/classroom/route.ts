import { type NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/classroom/server/api-response';
import { readClassroom, isValidClassroomId } from '@/lib/classroom/server/classroom-storage';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { jobId } = await context.params;

    if (!isValidClassroomId(jobId)) {
      return apiError('INVALID_REQUEST', 400, 'Invalid classroom id');
    }

    const classroom = await readClassroom(jobId);
    if (!classroom) {
      return apiError('INVALID_REQUEST', 404, 'Classroom not found');
    }

    return apiSuccess({ classroom });
  } catch (error) {
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to retrieve classroom data',
      error instanceof Error ? error.message : String(error),
    );
  }
}
