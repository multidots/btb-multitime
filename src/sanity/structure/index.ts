import type { StructureResolver } from 'sanity/structure'
import { FiHome, FiUsers, FiBriefcase, FiFolder, FiClock, FiFileText, FiBarChart2, FiSettings, FiCalendar } from 'react-icons/fi'
import { apiVersion } from '../env'

export const structure: StructureResolver = (S) =>
  S.list()
    .title('Content')
    .items([
      // Clients - Parent with dropdown filters
      S.listItem()
        .title('Clients')
        .icon(FiBriefcase)
        .child(
          S.list()
            .title('Clients')
            .items([
              S.listItem()
                .title('All Clients')
                .child(S.documentTypeList('client').title('All Clients')),
              S.listItem()
                .title('Active Clients')
                .child(
                  S.documentList()
                    .title('Active Clients')
                    .filter('_type == "client" && isActive == true')
                    .apiVersion(apiVersion)
                ),
              S.listItem()
                .title('Archived Clients')
                .child(
                  S.documentList()
                    .title('Archived Clients')
                    .filter('_type == "client" && isArchived == true')
                    .apiVersion(apiVersion)
                ),
            ])
        ),

      S.divider(),

      // Projects - Parent with dropdown filters
      S.listItem()
        .title('Projects')
        .icon(FiFolder)
        .child(
          S.list()
            .title('Projects')
            .items([
              S.listItem()
                .title('All Projects')
                .child(S.documentTypeList('project').title('All Projects')),
              S.listItem()
                .title('Active Projects')
                .child(
                  S.documentList()
                    .title('Active Projects')
                    .filter('_type == "project" && status == "active"')
                    .apiVersion(apiVersion)
                ),
              S.listItem()
                .title('Planning Projects')
                .child(
                  S.documentList()
                    .title('Planning')
                    .filter('_type == "project" && status == "planning"')
                    .apiVersion(apiVersion)
                ),
              S.listItem()
                .title('On Hold Projects')
                .child(
                  S.documentList()
                    .title('On Hold')
                    .filter('_type == "project" && status == "on_hold"')
                    .apiVersion(apiVersion)
                ),
              S.listItem()
                .title('Completed Projects')
                .child(
                  S.documentList()
                    .title('Completed')
                    .filter('_type == "project" && status == "completed"')
                    .apiVersion(apiVersion)
                ),
              S.listItem()
                .title('Billable Projects')
                .child(
                  S.documentList()
                    .title('Billable Projects')
                    .filter('_type == "project" && billableType == "billable"')
                    .apiVersion(apiVersion)
                ),
              S.listItem()
                .title('Non-Billable Projects')
                .child(
                  S.documentList()
                    .title('Non-Billable Projects')
                    .filter('_type == "project" && billableType == "non_billable"')
                    .apiVersion(apiVersion)
                ),
              S.listItem()
                .title('Projects by Client')
                .child(
                  S.documentTypeList('client')
                    .title('By Client')
                    .child((clientId) =>
                      S.documentList()
                        .title('Projects')
                        .filter('_type == "project" && client._ref == $clientId')
                        .params({ clientId })
                        .apiVersion(apiVersion)
                    )
                ),
            ])
        ),

      S.divider(),

      // Tasks - Parent with dropdown filters
      S.listItem()
        .title('Tasks')
        .icon(FiFileText)
        .child(
          S.list()
            .title('Tasks')
            .items([
              S.listItem()
                .title('All Tasks')
                .child(S.documentTypeList('task').title('All Tasks')),
              S.listItem()
                .title('Active Tasks')
                .child(
                  S.documentList()
                    .title('Active Tasks')
                    .filter('_type == "task" && isActive == true && isArchived != true')
                    .apiVersion(apiVersion)
                ),
              S.listItem()
                .title('Inactive Tasks')
                .child(
                  S.documentList()
                    .title('Inactive Tasks')
                    .filter('_type == "task" && isActive == false && isArchived != true')
                    .apiVersion(apiVersion)
                ),
              S.listItem()
                .title('Archived Tasks')
                .child(
                  S.documentList()
                    .title('Archived Tasks')
                    .filter('_type == "task" && isArchived == true')
                    .apiVersion(apiVersion)
                ),
              S.listItem()
                .title('Billable Tasks')
                .child(
                  S.documentList()
                    .title('Billable Tasks')
                    .filter('_type == "task" && isBillable == true')
                    .apiVersion(apiVersion)
                ),
              S.listItem()
                .title('Non-Billable Tasks')
                .child(
                  S.documentList()
                    .title('Non-Billable Tasks')
                    .filter('_type == "task" && isBillable == false')
                    .apiVersion(apiVersion)
                ),
            ])
        ),

      S.divider(),

      // People - Parent with dropdown filters
      S.listItem()
        .title('People')
        .icon(FiUsers)
        .child(
          S.list()
            .title('People')
            .items([
              S.listItem()
                .title('All Users')
                .child(
                  S.documentList()
                    .title('All Users')
                    .filter('_type == "user" && isArchived != true')
                    .apiVersion(apiVersion)
                ),
              S.listItem()
                .title('Active Users')
                .child(
                  S.documentList()
                    .title('Active Users')
                    .filter('_type == "user" && isActive == true && isArchived != true')
                    .apiVersion(apiVersion)
                ),
              S.listItem()
                .title('Inactive Users')
                .child(
                  S.documentList()
                    .title('Inactive Users')
                    .filter('_type == "user" && isActive == false && isArchived != true')
                    .apiVersion(apiVersion)
                ),
              S.listItem()
                .title('Archived Users')
                .child(
                  S.documentList()
                    .title('Archived Users')
                    .filter('_type == "user" && isArchived == true')
                    .apiVersion(apiVersion)
                ),
              S.listItem()
                .title('By Designation')
                .child(
                  S.documentTypeList('jobcategory')
                    .title('By Designation')
                    .child((jobCategoryId) =>
                      S.documentList()
                        .title('Users')
                        .filter('_type == "user" && jobCategory._ref == $jobCategoryId')
                        .params({ jobCategoryId })
                        .apiVersion(apiVersion)
                    )
              ),
              S.listItem()
                .title('By Role')
                .child(
                  S.list()
                    .title('By Role')
                    .items([
                      S.listItem()
                        .title('Admin')
                        .child(
                          S.documentList()
                            .title('Admin Users')
                            .filter('_type == "user" && role == "admin"')
                            .apiVersion(apiVersion)
                        ),
                      S.listItem()
                        .title('Manager')
                        .child(
                          S.documentList()
                            .title('Manager Users')
                            .filter('_type == "user" && role == "manager"')
                            .apiVersion(apiVersion)
                        ),
                      S.listItem()
                        .title('User')
                        .child(
                          S.documentList()
                            .title('Regular Users')
                            .filter('_type == "user" && role == "user"')
                            .apiVersion(apiVersion)
                        ),
                    ])
                ),
            ])
        ),

      S.divider(),

      // Teams - Parent with dropdown filters
      S.listItem()
        .title('Teams')
        .icon(FiUsers)
        .child(
          S.list()
            .title('Teams')
            .items([
              S.listItem()
                .title('All Teams')
                .child(S.documentTypeList('team').title('All Teams')),
              S.listItem()
                .title('Active Teams')
                .child(
                  S.documentList()
                    .title('Active Teams')
                    .filter('_type == "team" && isActive == true')
                    .apiVersion(apiVersion)
                ),
            ])
        ),

      S.divider(),

      // Timesheets (Weekly) - New structure
      S.listItem()
        .title('Timesheets')
        .icon(FiCalendar)
        .child(
          S.list()
            .title('Timesheets')
            .items([
              S.listItem()
                .title('All Timesheets')
                .child(S.documentTypeList('timesheet').title('All Timesheets')),
              S.listItem()
                .title('Draft')
                .child(
                  S.documentList()
                    .title('Draft Timesheets')
                    .filter('_type == "timesheet" && status == "unsubmitted"')
                    .apiVersion(apiVersion)
                ),
              S.listItem()
                .title('Pending Approval')
                .child(
                  S.documentList()
                    .title('Pending Approval')
                    .filter('_type == "timesheet" && status == "submitted"')
                    .apiVersion(apiVersion)
                ),
              S.listItem()
                .title('Approved')
                .child(
                  S.documentList()
                    .title('Approved Timesheets')
                    .filter('_type == "timesheet" && status == "approved"')
                    .apiVersion(apiVersion)
                ),
              S.listItem()
                .title('Rejected')
                .child(
                  S.documentList()
                    .title('Rejected Timesheets')
                    .filter('_type == "timesheet" && status == "rejected"')
                    .apiVersion(apiVersion)
                ),
              S.listItem()
                .title('By User')
                .child(
                  S.documentTypeList('user')
                    .title('Select User')
                    .child((userId) =>
                      S.document()
                        .documentId(userId)
                        .schemaType('user')
                    )
                ),
            ])
        ),

      S.divider(),

      // Reports
      S.listItem()
        .title('Reports')
        .icon(FiBarChart2)
        .child(S.documentTypeList('report').title('Reports')),
    ])

