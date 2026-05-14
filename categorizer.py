import os

routes_dir = '/tmp/cc/artifacts/api-server/src/routes'
files = sorted([f for f in os.listdir(routes_dir) if f.endswith('.ts')])

categories = {
    'CRM': ['leads.ts', 'customers.ts', 'customerNotify.ts', 'customerProperties.ts', 'customerTimeline.ts', 'pipeline.ts', 'referrals.ts', 'funnels.ts', 'campaigns.ts', 'followUpSequences.ts', 'marketing.ts'],
    'Estimating': ['estimates.ts', 'estimateTemplates.ts', 'estimateBuilders.ts', 'estimatesPublic.ts', 'quotes.ts', 'proposalPdf.ts', 'proposals.ts', 'takeoffs.ts', 'srMeasurements.ts', 'pricebook.ts', 'lineItemLibrary.ts', 'flatRateBundles.ts', 'changeOrders.ts', 'changeOrderSign.ts'],
    'Invoicing': ['invoices.ts', 'recurringInvoices.ts', 'receipts.ts', 'expenses.ts', 'financing.ts', 'payments.ts', 'subPayments.ts', 'stripe.ts', 'retainage.ts', 'lienWaivers.ts', 'drawSchedules.ts', 'aiaPayApp.ts', 'vendorInvoices.ts'],
    'Projects': ['projects.ts', 'projectPhotos.ts', 'projectEquipment.ts', 'jobCosting.ts', 'jobCosts.ts', 'jobNotes.ts', 'closeouts.ts', 'warranties.ts', 'permits.ts', 'submittals.ts', 'subcontractors.ts', 'subBids.ts', 'fieldReports.ts', 'serviceAgreements.ts', 'dailyLogs.ts'],
    'Manpower': ['employees.ts', 'employeeNotify.ts', 'crewAssignments.ts', 'crewChat.ts', 'timeclock.ts', 'timeOff.ts', 'payroll.ts', 'checkins.ts', 'safety.ts', 'incidentReports.ts', 'education.ts', 'licenses.ts', 'insurance.ts'],
    'AI': ['aiIntelligence.ts', 'aiPhotoEstimate.ts', 'aiStaff.ts', 'aiUsage.ts', 'aiVoice.ts', 'amberBriefing.ts', 'amberIntelligence.ts', 'amberSocial.ts', 'searchAI.ts', 'seranaIntelligence.ts', 'serana.ts', 'daniella.ts', 'vapi.ts', 'voiceNotes.ts'],
    'Phone': ['conversations.ts', 'smsConversations.ts', 'smsConsent.ts', 'chat.ts', 'bookingSlots.ts', 'bookingWidget.ts'],
    'Social': ['socialMedia.ts', 'socialPosts.ts', 'youtube.ts', 'googleBusiness.ts', 'googleBusinessManage.ts'],
    'Documents': ['storage.ts', 'upload.ts', 'vault.ts', 'googleDrive.ts', 'contentLibrary.ts'],
    'Other': ['admin.ts', 'agentTasks.ts', 'alerts.ts', 'analytics.ts', 'auth.ts', 'automationRules.ts', 'calendarEvents.ts', 'calendarSync.ts', 'demo.ts', 'fleet.ts', 'gmail.ts', 'googleAuth.ts', 'googleCalendar.ts', 'health.ts', 'index.ts', 'integrations.ts', 'inventory.ts', 'invites.ts', 'legal.ts', 'mileage.ts', 'notifications.ts', 'overhead.ts', 'playbook.ts', 'pnlDashboard.ts', 'portal.ts', 'profitabilityReport.ts', 'quickbooks.ts', 'rateSettings.ts', 'renovation.ts', 'toolConnections.ts', 'weather.ts', 'equipment.ts', 'equipmentCheckout.ts', 'equipmentMaintenance.ts']
}

for f in files:
    cat = 'Other'
    for c, fs in categories.items():
        if f in fs:
            cat = c
            break
    print(f"{f}|{cat}")
