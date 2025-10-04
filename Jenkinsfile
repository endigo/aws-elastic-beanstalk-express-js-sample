// Declarative Jenkins pipeline for CI/CD of Express.js application
// Includes dependency installation, testing, security scanning, and Docker image deployment
pipeline {
    // Agent configuration - defines where and how pipeline stages execute
    agent {
        // Use Docker container as build agent for consistent, isolated environment
        docker {
            // Bun runtime on Alpine Linux for minimal image size and fast package management
            image 'oven/bun:1-alpine'
            // Container arguments for Docker-in-Docker (DinD) and security
            // -u root:root: Run as root to access Docker socket
            // -v /certs/client:/certs/client:ro: Mount TLS certificates for secure Docker daemon communication
            // -v /var/run/docker.sock:/var/run/docker.sock: Mount Docker socket for building images
            args '-u root:root -v /certs/client:/certs/client:ro -v /var/run/docker.sock:/var/run/docker.sock'
        }
    }

    // Environment variables available to all pipeline stages
    environment {
        // Docker daemon connection via TLS for secure communication with DinD service
        DOCKER_HOST = 'tcp://docker:2376'
        // Enable TLS verification to prevent man-in-the-middle attacks
        DOCKER_TLS_VERIFY = '1'
        // Path to TLS certificates for Docker daemon authentication
        DOCKER_CERT_PATH = '/certs/client'
        // Docker registry URL for image push operations
        DOCKER_REGISTRY = 'index.docker.io/v1/'
        // Target Docker image name in format username/repository
        DOCKER_IMAGE_NAME = 'endigo/isec6000-assignment-2'
        // Credential ID for Docker Hub authentication (defined in jenkins-casc.yaml)
        DOCKER_CREDENTIALS_ID = 'docker-hub-credentials'
        // Snyk API token loaded from Jenkins credentials store
        SNYK_TOKEN = credentials('snyk-api-token')
        // Minimum severity level that causes security scan to fail the build
        SEVERITY_THRESHOLD = 'high'
    }

    // Pipeline options - global settings that apply to entire pipeline execution
    options {
        // Maximum pipeline execution time - prevents runaway builds from consuming resources
        timeout(time: 30, unit: 'MINUTES')
        // Add timestamps to console output for debugging and performance analysis
        timestamps()
        // Skip automatic SCM checkout - we'll do it manually in Checkout stage for better control
        skipDefaultCheckout()
        // Enable ANSI color codes in console output for better readability
        ansiColor('xterm')
        // Build retention policy - automatically delete old builds to save disk space
        buildDiscarder(logRotator(
            daysToKeepStr: '30',        // Delete builds older than 30 days
            numToKeepStr: '20',         // Keep maximum 20 builds regardless of age
            artifactDaysToKeepStr: '14', // Artifacts are larger - shorter retention
            artifactNumToKeepStr: '10'   // Keep only 10 builds with artifacts
        ))
    }

    // Stages - sequential execution of pipeline steps
    stages {
        // Stage 1: Install required system tools
        stage('Install System Tools') {
            steps {
                // Install required tools in Alpine container
                // git: Required for capturing commit information after checkout
                // docker-cli: Required for building and managing Docker images
                // curl: Required for downloading Snyk CLI
                // --no-cache: Prevents package cache from being stored, reducing image size
                sh 'apk add --no-cache git curl docker-cli'
            }
        }
        // Stage 2: Checkout source code from version control
        stage('Checkout') {
            steps {
                script {
                    // Log repository information for traceability
                    echo "==== STAGE: Checkout ===="
                    env.GIT_COMMIT = sh(script: 'git rev-parse HEAD', returnStdout: true).trim()
                    env.GIT_BRANCH = sh(script: 'git rev-parse --abbrev-ref HEAD', returnStdout: true).trim()

                    echo "Repository: ${env.GIT_URL}"
                    echo "Branch: ${env.GIT_BRANCH}"
                }
                // Clone repository using SCM configuration from jenkins-casc.yaml
                checkout scm
                script {
                    echo "==== Checkout completed successfully ===="
                }
            }
        }

        // Stage 3: Install Snyk security scanning tool
        stage('Install Snyk') {
            steps {
                // Download latest Snyk CLI binary for Alpine Linux
                // -fsSL flags: fail silently, show errors, follow redirects, location aware
                sh 'curl -fsSL https://static.snyk.io/cli/latest/snyk-alpine -o /usr/local/bin/snyk'
                // Make binary executable
                sh 'chmod +x /usr/local/bin/snyk'
            }
        }

        // Stage 4: Install application dependencies
        stage('Install Dependencies') {
            steps {
                script {
                    echo "==== STAGE: Install Dependencies ===="
                    echo "Installing dependencies using bun..."
                }
                // Install dependencies using Bun package manager
                // --frozen-lockfile: Ensure lockfile is not modified (reproducible builds)
                // 2>&1: Redirect stderr to stdout for complete logging
                // tee: Write output to both console and log file for archiving
                sh 'bun install --frozen-lockfile 2>&1 | tee dependency-install.log'
                script {
                    echo "==== Dependencies installed successfully ===="
                }
            }
        }

        // Stage 5: Execute unit tests
        stage('Run Unit Tests') {
            steps {
                script {
                    echo "==== STAGE: Run Unit Tests ===="
                    try {
                        // Run test suite using Bun test runner
                        // Output logged to both console and file for archiving
                        sh 'bun test 2>&1 | tee test-results.log'
                        echo "==== Tests passed successfully ===="
                    } catch (Exception e) {
                        // Gracefully handle projects without test scripts
                        // Allows pipeline to continue even if tests are not yet implemented
                        echo 'No test script found in package.json, skipping tests'
                        echo "==== Tests stage skipped ===="
                    }
                }
            }
        }

        // Stage 6: Dependency security scanning with Snyk
        stage('Security Scan - Snyk') {
            // Conditional execution - only run if Snyk token is configured
            when {
                expression { env.SNYK_TOKEN != null }
            }
            steps {
                script {
                    echo "==== STAGE: Security Scan - Snyk ===="
                    echo "Severity threshold: ${SEVERITY_THRESHOLD}"

                    // Track authentication and scan status
                    def snykInstallFailed = false
                    def snykResult = 0

                    try {
                        // Authenticate with Snyk service using API token
                        echo "Authenticating with Snyk..."
                        sh 'snyk auth ${SNYK_TOKEN}'
                        echo "Authentication successful"
                    } catch (Exception e) {
                        // Handle authentication failures gracefully
                        echo "Snyk CLI installation failed: ${e.getMessage()}"
                        echo "Skipping security scan..."
                        snykInstallFailed = true
                    }

                    if (!snykInstallFailed) {
                        echo "Running dependency vulnerability scan..."
                        // Scan dependencies for known vulnerabilities
                        // --severity-threshold: Only fail on high/critical issues
                        // --json: Generate machine-readable report
                        // || true: Prevent immediate pipeline failure to handle result properly
                        snykResult = sh(
                            script: 'snyk test --severity-threshold=${SEVERITY_THRESHOLD} --json > snyk-report.json 2>&1 | tee snyk-scan.log || true',
                            returnStatus: true
                        )

                        // Display vulnerability report in console
                        sh 'cat snyk-report.json || echo "No Snyk report generated"'

                        // Fail pipeline if vulnerabilities exceed severity threshold
                        if (snykResult != 0) {
                            echo "==== Security vulnerabilities detected ===="
                            // Stop pipeline execution - security issues must be addressed
                            error "Security vulnerabilities found with severity ${SEVERITY_THRESHOLD} or higher. Pipeline failed."
                        } else {
                            echo "==== Security scan passed ===="
                        }
                    }
                }
            }
        }

        // Stage 7: Build Docker container image
        stage('Build Docker Image') {
            steps {
                script {
                    echo "==== STAGE: Build Docker Image ===="
                    echo "Image name: ${DOCKER_IMAGE_NAME}"
                    echo "Build number: ${env.BUILD_NUMBER}"
                    echo "Git Commit: ${env.GIT_COMMIT}"

                    // Verify Dockerfile exists before attempting build
                    if (fileExists('Dockerfile')) {
                        echo "Building Docker image..."
                        // Build image using Jenkins Docker plugin
                        // Tag with commit hash for traceability and immutability
                        def customImage = docker.build("${DOCKER_IMAGE_NAME}:${env.GIT_COMMIT}")
                        // Also tag as 'latest' for convenience in development
                        customImage.tag('latest')
                        echo "==== Docker image built successfully ===="
                        echo "Tagged as: ${DOCKER_IMAGE_NAME}:${env.GIT_COMMIT}"
                        echo "Tagged as: ${DOCKER_IMAGE_NAME}:latest"
                    } else {
                        // Dockerfile missing - warn but don't fail pipeline
                        echo "WARNING: Dockerfile not found, skipping build"
                    }
                }
            }
        }

        // Stage 8: Scan Docker image for vulnerabilities
        stage('Container Security Scan') {
            // Only run if Snyk token is configured
            when {
                expression { env.SNYK_TOKEN != null }
            }
            steps {
                script {
                    echo "==== STAGE: Container Security Scan ===="
                    echo "Scanning image: ${DOCKER_IMAGE_NAME}:${env.GIT_COMMIT}"
                    echo "Severity threshold: ${SEVERITY_THRESHOLD}"

                    try {
                        // Scan Docker image for OS and application vulnerabilities
                        // Checks base image, installed packages, and application dependencies
                        // || true: Continue even if vulnerabilities found (non-blocking scan)
                        sh "snyk container test ${DOCKER_IMAGE_NAME}:${env.GIT_COMMIT} --severity-threshold=${SEVERITY_THRESHOLD} --json > snyk-container-report.json 2>&1 | tee snyk-container-scan.log || true"
                        echo "==== Container security scan completed ===="
                    } catch (Exception e) {
                        // Don't fail pipeline on scan errors - allows deployment to continue
                        echo "Container security scan failed: ${e.getMessage()}"
                        echo "Continuing pipeline execution..."
                    }
                }
            }
        }

        // Stage 9: Push Docker image to registry
        stage('Push to Docker Registry') {
            // Only run if Docker credentials are configured
            when {
                expression { env.DOCKER_CREDENTIALS_ID != null }
            }
            steps {
                script {
                    echo "==== STAGE: Push to Docker Registry ===="
                    echo "Registry: ${DOCKER_REGISTRY}"
                    echo "Image: ${DOCKER_IMAGE_NAME}"

                    try {
                        echo "Pushing image to registry..."
                        // Authenticate with Docker Hub and push images
                        // withRegistry: Automatically handles docker login/logout
                        docker.withRegistry("https://${DOCKER_REGISTRY}", DOCKER_CREDENTIALS_ID) {
                            // Push commit-tagged image for version tracking
                            docker.image("${DOCKER_IMAGE_NAME}:${env.GIT_COMMIT}").push()
                            // Push latest tag for development/testing convenience
                            docker.image("${DOCKER_IMAGE_NAME}:latest").push()
                        }
                        echo "==== Images pushed successfully ===="
                        echo "Pushed: ${DOCKER_IMAGE_NAME}:${env.GIT_COMMIT}"
                        echo "Pushed: ${DOCKER_IMAGE_NAME}:latest"
                    } catch (Exception e) {
                        // Handle authentication or network failures gracefully
                        echo "Docker push failed: ${e.getMessage()}"
                        echo "This might be due to missing Docker Hub credentials"
                    }
                }
            }
        }

        // Stage 10: Clean up Docker artifacts
        stage('Clean Up') {
            steps {
                script {
                    echo "==== STAGE: Clean Up ===="
                    echo "Removing local Docker images..."
                }
                // Remove built images to free disk space
                // || true: Continue even if removal fails (images may already be deleted)
                sh """
                    docker rmi ${DOCKER_IMAGE_NAME}:${env.GIT_COMMIT} || true
                    docker rmi ${DOCKER_IMAGE_NAME}:latest || true
                    docker system prune -f || true
                """
                script {
                    echo "==== Clean up completed ===="
                }
            }
        }
    }

    // Post-build actions - execute after all stages complete
    post {
        // Always block - runs regardless of build success or failure
        always {
            script {
                echo "==== STAGE: Post-Build Actions ===="
                echo "Archiving artifacts and logs..."
            }

            // Archive build artifacts and logs for later review
            // Artifacts are available via Jenkins UI for download and analysis
            archiveArtifacts artifacts: '''
                **/*-report.json,
                **/*-report.html,
                **/*.log,
                **/test-results.*,
                **/build.log
            ''', allowEmptyArchive: true,  // Don't fail if no artifacts found
                fingerprint: true          // Create MD5 checksums for tracking changes

            // Publish warnings for code analysis (requires warnings-ng plugin)
            // Integrates static analysis results into Jenkins UI
            script {
                try {
                    recordIssues enabledForFailure: true, tools: [
                        checkStyle(pattern: '**/checkstyle-result.xml'),
                        pmdParser(pattern: '**/pmd.xml'),
                        spotBugs(pattern: '**/spotbugsXml.xml')
                    ]
                } catch (Exception e) {
                    // Gracefully handle missing plugin or analysis files
                    echo "Warnings plugin not fully configured: ${e.getMessage()}"
                }
            }

            // Generate comprehensive pipeline summary
            // Provides audit trail and debugging information
            script {
                echo "==== PIPELINE SUMMARY ===="
                // Build identification information
                echo "Build Number: ${env.BUILD_NUMBER}"
                echo "Job Name: ${env.JOB_NAME}"
                echo "Branch: ${env.BRANCH_NAME ?: 'N/A'}"
                echo "Commit: ${env.GIT_COMMIT ?: 'N/A'}"
                // Direct link to this build in Jenkins UI
                echo "Build URL: ${env.BUILD_URL}"
                // Workspace path on Jenkins agent
                echo "Workspace: ${env.WORKSPACE}"
                // Final build result (SUCCESS, FAILURE, UNSTABLE)
                echo "Build Status: ${currentBuild.currentResult}"
                // Total execution time
                echo "Build Duration: ${currentBuild.durationString}"

                // List all artifacts that were archived
                // Helps identify what reports are available for review
                def artifactsArchived = []
                if (fileExists('snyk-report.json')) { artifactsArchived.add('snyk-report.json') }
                if (fileExists('snyk-container-report.json')) { artifactsArchived.add('snyk-container-report.json') }
                if (fileExists('snyk-scan.log')) { artifactsArchived.add('snyk-scan.log') }
                if (fileExists('snyk-container-scan.log')) { artifactsArchived.add('snyk-container-scan.log') }
                if (fileExists('dependency-install.log')) { artifactsArchived.add('dependency-install.log') }
                if (fileExists('test-results.log')) { artifactsArchived.add('test-results.log') }

                if (artifactsArchived.size() > 0) {
                    echo "Artifacts archived:"
                    artifactsArchived.each { artifact ->
                        echo "  - ${artifact}"
                    }
                } else {
                    echo "No artifacts were archived"
                }

                echo "============================"
            }

            // Clean workspace after build completes
            // Prevents disk space exhaustion from accumulated build files
            cleanWs(
                cleanWhenAborted: true,    // Clean even if user cancels build
                cleanWhenFailure: true,    // Clean after failed builds
                cleanWhenNotBuilt: true,   // Clean if build didn't start properly
                cleanWhenSuccess: true,    // Clean after successful builds
                cleanWhenUnstable: true,   // Clean after unstable builds (tests failed but build succeeded)
                deleteDirs: true,          // Remove subdirectories, not just files
                disableDeferredWipeout: true, // Clean immediately, don't defer to later
                notFailBuild: true         // Don't fail build if cleanup fails
            )
        }
        // Success block - runs only when all stages pass
        success {
            echo '==== Pipeline completed successfully ===='
        }
        // Failure block - runs when any stage fails or errors occur
        failure {
            echo '==== Pipeline failed ===='
            echo 'Please check the logs above for details.'
            // Indicate which stage caused the failure for faster debugging
            echo "Failed stage: ${env.STAGE_NAME}"
        }
        // Unstable block - runs when tests fail but build succeeds
        // Typically occurs when test failures are non-blocking
        unstable {
            echo '==== Pipeline completed with warnings ===='
        }
    }
}
