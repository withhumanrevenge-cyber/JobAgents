import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import { ResumeData } from "@/types"

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    lineHeight: 1.5,
    color: "#1e293b",
    backgroundColor: "#ffffff",
  },
  header: {
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e1",
    paddingBottom: 10,
  },
  name: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#0f172a",
    letterSpacing: 0.5,
  },
  contactRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 4,
    gap: 12,
  },
  contactText: {
    color: "#64748b",
    fontSize: 9,
  },
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#2563eb",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
    paddingBottom: 2,
    marginBottom: 6,
  },
  summaryText: {
    color: "#334155",
    fontSize: 9.5,
  },
  skillsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  skillBadge: {
    backgroundColor: "#f1f5f9",
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 8.5,
    color: "#334155",
  },
  entryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  entryTitle: {
    fontWeight: "bold",
    color: "#0f172a",
    fontSize: 10,
  },
  entrySub: {
    color: "#475569",
    fontStyle: "italic",
    fontSize: 9,
  },
  entryDate: {
    color: "#64748b",
    fontSize: 8.5,
  },
  bulletList: {
    marginTop: 3,
    paddingLeft: 8,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 2,
  },
  bulletPoint: {
    width: 6,
    color: "#2563eb",
    fontSize: 9,
  },
  bulletText: {
    flex: 1,
    color: "#334155",
    fontSize: 9,
  },
})

interface ResumeTemplateProps {
  data: ResumeData
}

export function ResumeTemplate({ data }: ResumeTemplateProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.name}>{data.name}</Text>
          <View style={styles.contactRow}>
            <Text style={styles.contactText}>{data.email}</Text>
            <Text style={styles.contactText}>•</Text>
            <Text style={styles.contactText}>{data.phone}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <Text style={styles.summaryText}>{data.summary}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Technical Skills</Text>
          <View style={styles.skillsContainer}>
            {data.skills.map((skill, idx) => (
              <Text key={idx} style={styles.skillBadge}>
                {skill}
              </Text>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Professional Experience</Text>
          {data.experience.map((exp, idx) => (
            <View key={idx} style={{ marginBottom: 8 }}>
              <View style={styles.entryHeader}>
                <Text style={styles.entryTitle}>{exp.title}</Text>
                <Text style={styles.entryDate}>{exp.dates}</Text>
              </View>
              <Text style={styles.entrySub}>{exp.company}</Text>
              <View style={styles.bulletList}>
                {exp.bullets.map((bullet, bIdx) => (
                  <View key={bIdx} style={styles.bulletRow}>
                    <Text style={styles.bulletPoint}>•</Text>
                    <Text style={styles.bulletText}>{bullet}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>

        {data.projects && data.projects.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Technical Projects</Text>
            {data.projects.map((proj, idx) => (
              <View key={idx} style={{ marginBottom: 6 }}>
                <View style={styles.entryHeader}>
                  <Text style={styles.entryTitle}>{proj.name}</Text>
                  {proj.url && (
                    <Text style={{ fontSize: 8, color: "#2563eb" }}>{proj.url}</Text>
                  )}
                </View>
                <Text style={styles.summaryText}>{proj.description}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
                  <Text style={{ fontSize: 7.5, color: "#64748b", fontWeight: "bold" }}>Tech Stack:</Text>
                  {proj.tech.map((t, tIdx) => (
                    <Text key={tIdx} style={{ fontSize: 7.5, color: "#475569" }}>
                      {t}{tIdx < proj.tech.length - 1 ? "," : ""}
                    </Text>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Education</Text>
          {data.education.map((edu, idx) => (
            <View key={idx} style={styles.entryHeader}>
              <View>
                <Text style={styles.entryTitle}>{edu.degree}</Text>
                <Text style={styles.entrySub}>{edu.school}</Text>
              </View>
              <Text style={styles.entryDate}>{edu.year}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  )
}
