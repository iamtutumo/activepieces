import { LATEST_JOB_DATA_SCHEMA_VERSION, QueueName, RepeatableJobType, ScheduledJobData } from '@activepieces/server-shared'
import { ExecutionType, isNil, RunEnvironment, ScheduleType } from '@activepieces/shared'
import { Job } from 'bullmq'
import { FastifyBaseLogger } from 'fastify'
import { flowRepo } from '../../flows/flow/flow.repo'
import { distributedLock } from '../../helper/lock'
import { bullMqGroups } from './redis-queue'

export const redisMigrations = (log: FastifyBaseLogger) => ({
    async run(): Promise<void> {
        const migrationLock = await distributedLock.acquireLock({
            key: 'jobs_lock',
            timeout: 30000,
        })
        try {
            const scheduledJobs = await getJobsToMigrate()
            if (scheduledJobs.length === 0) {
                return
            }
            log.info({
                count: scheduledJobs.length,
            }, 'migiration of scheduled jobs started')
            for (const job of scheduledJobs) {
                if (job) {
                    await migrateJob(job, log)
                }
            }
            log.info('migration of scheduled jobs completed')
        }
        finally {
            await migrationLock.release()
        }
    },
})

async function getJobsToMigrate(): Promise<(Job<ScheduledJobData> | undefined)[]> {
    return (await bullMqGroups[QueueName.SCHEDULED].getJobs()).filter((job) => !isNil(job?.data) && job.data.schemaVersion !== LATEST_JOB_DATA_SCHEMA_VERSION)
}

async function migrateJob(job: Job<ScheduledJobData>, log: FastifyBaseLogger): Promise<void> {
    let modifiedJobData = JSON.parse(JSON.stringify(job.data))

    if (isNil(modifiedJobData.schemaVersion) || modifiedJobData.schemaVersion === 1) {
        const { flowVersion, projectId, triggerType } = modifiedJobData
        modifiedJobData = {
            schemaVersion: 2,
            flowVersionId: flowVersion.id,
            flowId: flowVersion.flowId,
            projectId,
            environment: RunEnvironment.PRODUCTION,
            executionType: ExecutionType.BEGIN,
            triggerType,
        }
        await job.updateData(modifiedJobData)
    }

    if (modifiedJobData.schemaVersion === 2) {
        await updateCronExpressionOfRedisToPostgresTable(job, log)
        modifiedJobData.schemaVersion = 3
        await job.updateData(modifiedJobData)
    }

    if (modifiedJobData.schemaVersion === 3) {
        modifiedJobData.schemaVersion = 4
        if (modifiedJobData.executionType === ExecutionType.BEGIN) {
            modifiedJobData.jobType = RepeatableJobType.EXECUTE_TRIGGER
        }
        else if (modifiedJobData.executionType === ExecutionType.RESUME) {
            modifiedJobData.jobType = RepeatableJobType.DELAYED_FLOW
        }
        modifiedJobData.executionType = undefined
        await job.updateData(modifiedJobData)
    }
}

async function updateCronExpressionOfRedisToPostgresTable(job: Job, log: FastifyBaseLogger): Promise<void> {
    const { tz, pattern } = job.opts.repeat || {}
    if (isNil(tz) || isNil(pattern)) {
        log.error('Found unrepeatable job in repeatable queue')
        return
    }
    const flow = await flowRepo().findOneBy({
        publishedVersionId: job.data.flowVersionId,
    })
    if (isNil(flow)) {
        return
    }
    await flowRepo().update(flow.id, {
        schedule: {
            type: ScheduleType.CRON_EXPRESSION,
            timezone: tz,
            cronExpression: pattern,
        },
    })
}
